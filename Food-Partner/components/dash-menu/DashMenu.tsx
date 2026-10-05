/* ══════════════════════════════════════════════════════════════════════════
   Food Partner — Menu.

   Laid out as the Adios menu tab: the title with "Add dish", search, the
   stock filter and the category chips held still above the list, and one
   card per dish with its photo, diet mark, price and the in-stock switch.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarHeight } from "@/components/dash/organisms/TabBar";
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  IconButton,
  InfoNote,
  ScreenShell,
  ScreenTitle,
  SectionHeader,
  SegmentedControl,
  TextField,
  ToggleSwitch,
  Txt,
  VegMarker,
  staggerListItem,
} from "@/components/ui";
import { rupees } from "@/lib/money";
import {
  listMyProducts,
  setProductAvailability,
  type ServerProduct,
} from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { font, line, ms, radius, size, ui } from "@/theme/ui";

type Filter = "all" | "available" | "unavailable";

export function DashMenu() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const session = usePartnerStore((s) => s.session);

  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setError("You are signed out. Sign in again to continue.");
      return;
    }
    setError("");
    try {
      setProducts(await listMyProducts(session.token));
    } catch (err) {
      setError((err as Error)?.message || "We could not load your menu.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  /* The pull's own flag. `loading` is set true only on mount, so a pull
     started a load with the spinner already off — it vanished at once and
     the partner could not tell whether anything had been fetched. */
  const [refreshing, setRefreshing] = useState(false);
  const pull = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = async (product: ServerProduct) => {
    /* One write per dish at a time: a second flip mid-save raced the first,
       and the rollback of whichever failed could undo the one that worked. */
    if (!session?.token || pending[product.productId]) return;
    const next = !product.isAvailable;

    setProducts((list) =>
      list.map((p) => (p.productId === product.productId ? { ...p, isAvailable: next } : p))
    );
    setPending((p) => ({ ...p, [product.productId]: true }));

    try {
      await setProductAvailability(session.token, product.productId, next);
    } catch (err) {
      setProducts((list) =>
        list.map((p) => (p.productId === product.productId ? { ...p, isAvailable: !next } : p))
      );
      setError((err as Error)?.message || "That did not save.");
    } finally {
      setPending((p) => ({ ...p, [product.productId]: false }));
    }
  };

  // Categories extracted dynamically from products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set)];
  }, [products]);

  /* A category that no longer exists (its last dish deleted or moved) drops
     back to All — the chip stayed selected on nothing, and the list read
     "No dishes match" with no visible filter to clear. */
  useEffect(() => {
    if (selectedCategory !== "All" && !categories.includes(selectedCategory)) setSelectedCategory("All");
  }, [categories, selectedCategory]);

  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === "available" && !p.isAvailable) return false;
      if (filter === "unavailable" && p.isAvailable) return false;
      if (selectedCategory !== "All" && p.category !== selectedCategory) return false;
      if (needle && !`${p.productName} ${p.category}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [products, search, filter, selectedCategory]);

  const grouped = useMemo(() => {
    return filteredProducts.reduce<{ category: string; items: ServerProduct[] }[]>((acc, product) => {
      const bucket = acc.find((g) => g.category === (product.category || "General"));
      if (bucket) bucket.items.push(product);
      else acc.push({ category: product.category || "General", items: [product] });
      return acc;
    }, []);
  }, [filteredProducts]);

  const availableCount = products.filter((p) => p.isAvailable).length;
  const outOfStockCount = products.filter((p) => !p.isAvailable).length;

  return (
    <ScreenShell style={{ paddingTop: insets.top + 12 }}>
      <ScreenTitle
        title="Menu Management"
        subtitle={`${products.length} Dish${products.length === 1 ? "" : "es"} · ${availableCount} Active`}
        right={
          <Button
            title="Add Dish"
            size="sm"
            icon={<Ionicons name="add" size={18} color={ui.onBrand} />}
            onPress={() => router.push("/product/new")}
          />
        }
      />

      {/* ── Search and filters ─────────────────────────────────────────── */}
      <View style={styles.controls}>
        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search dishes or categories..."
          returnKeyType="search"
          icon={<Ionicons name="search" size={18} color={ui.muted} />}
          right={
            search ? (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={ui.muted} />
              </TouchableOpacity>
            ) : undefined
          }
        />
        <SegmentedControl<Filter>
          value={filter}
          onChange={setFilter}
          segments={[
            { key: "all", label: "All", count: products.length },
            { key: "available", label: "Available", count: availableCount },
            { key: "unavailable", label: "Out of Stock", count: outOfStockCount },
          ]}
        />
      </View>

      {categories.length > 2 && (
        <ChipRow
          topGap={12}
          value={selectedCategory}
          onChange={setSelectedCategory}
          options={categories.map((cat) => ({ key: cat, label: cat }))}
        />
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight }, categories.length <= 2 && { paddingTop: 14 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={ui.brand} colors={[ui.brand]} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!error && <InfoNote tone="danger" text={error} />}

        {loading && products.length === 0 && !error && (
          <ActivityIndicator size="large" color={ui.brand} style={styles.loader} />
        )}

        {/* ── No dishes yet ────────────────────────────────────────────── */}
        {!loading && products.length === 0 && (
          <EmptyState
            icon="restaurant-outline"
            title="No Dishes in Menu Yet"
            subtitle="Add your first dish to make your food menu live for hungry customers."
            actionLabel="Add Your First Dish"
            primaryAction
            onAction={() => router.push("/product/new")}
          />
        )}

        {/* ── The dishes, by category ──────────────────────────────────── */}
        {grouped.map((group) => (
          <View key={group.category} style={styles.group}>
            <SectionHeader title={group.category} meta={`${group.items.length} items`} />
            <View style={styles.groupItems}>
              {group.items.map((item, index) => (
                <Animated.View key={item.productId} entering={staggerListItem(index)}>
                  <DishCard
                    item={item}
                    saving={!!pending[item.productId]}
                    onToggle={() => toggle(item)}
                    onOpen={() => router.push(`/product/${item.productId}`)}
                  />
                </Animated.View>
              ))}
            </View>
          </View>
        ))}

        {products.length > 0 && grouped.length === 0 && (
          <EmptyState icon="search-outline" title="No matches" subtitle="No dishes match your search or filter." />
        )}
      </ScrollView>
    </ScreenShell>
  );
}

/** One dish: photo, diet mark, name, price and the in-stock switch. */
function DishCard({
  item,
  saving,
  onToggle,
  onOpen,
}: {
  item: ServerProduct;
  saving: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const inStock = item.isAvailable;
  return (
    <Card bordered dashed={!inStock} elevationLevel="none" padding={0} style={styles.dishCard}>
      <TouchableOpacity
        style={styles.dishRow}
        onPress={onOpen}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.productName}`}
      >
        <View style={styles.imageWrap}>
          {item.productImage?.url ? (
            <Image source={{ uri: item.productImage.url }} style={[styles.image, !inStock && styles.imageDim]} />
          ) : (
            <Ionicons name="fast-food-outline" size={30} color={ui.muted} />
          )}
          {!inStock ? (
            <View style={styles.soldOutTag}>
              <Txt style={styles.soldOutText}>Out of stock</Txt>
            </View>
          ) : null}
        </View>
        <View style={styles.dishBody}>
          <View style={styles.nameRow}>
            <VegMarker isVeg={item.isVeg} />
            <Txt style={styles.dishName} numberOfLines={1}>
              {item.productName}
            </Txt>
          </View>
          {!!item.description && (
            <Txt style={styles.description} numberOfLines={2}>
              {item.description}
            </Txt>
          )}
          <View style={styles.priceRow}>
            <Txt style={styles.price}>{rupees(item.discountedPrice || item.price)}</Txt>
            {!!item.discountedPrice && <Txt style={styles.originalPrice}>{rupees(item.price)}</Txt>}
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.dishFooter}>
        <ToggleSwitch
          value={item.isAvailable}
          onValueChange={onToggle}
          disabled={saving}
          accessibilityLabel={`${item.productName} available`}
        />
        <View style={styles.stockTexts}>
          <Txt style={[styles.stockLabel, { color: saving ? ui.muted : inStock ? ui.success : ui.error }]}>
            {saving ? "Saving..." : inStock ? "Available in menu" : "Out of stock"}
          </Txt>
        </View>
        <IconButton icon="create-outline" size={36} accessibilityLabel={`Edit ${item.productName}`} onPress={onOpen} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 16, gap: 12 },
  list: { paddingHorizontal: 16, gap: 22 },
  loader: { marginTop: 40 },

  group: {},
  groupItems: { gap: 12 },

  dishCard: { overflow: "hidden" },
  dishRow: { flexDirection: "row", gap: 12, padding: 12 },
  imageWrap: {
    width: ms(92),
    height: ms(92),
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: ui.sunken,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: "100%", height: "100%" },
  imageDim: { opacity: 0.45 },
  soldOutTag: {
    position: "absolute",
    bottom: 6,
    left: 6,
    right: 6,
    borderRadius: 6,
    backgroundColor: "rgba(16,19,18,0.7)",
    paddingVertical: 2,
    alignItems: "center",
  },
  soldOutText: { fontFamily: font.body.bold, fontSize: size.small, color: ui.white, textTransform: "uppercase" },
  dishBody: { flex: 1, minWidth: 0, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dishName: { flex: 1, fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
  description: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 },
  price: { fontFamily: font.heading.bold, fontSize: size.large, color: ui.text },
  originalPrice: {
    fontFamily: font.body.medium,
    fontSize: size.small,
    color: ui.muted,
    textDecorationLine: "line-through",
  },
  dishFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: ui.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stockTexts: { flex: 1 },
  stockLabel: { fontFamily: font.body.semibold, fontSize: size.small },
});

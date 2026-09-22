/* ══════════════════════════════════════════════════════════════════════════
   Food Partner — Redesigned Menu Screen
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Note, Refresher, Scroller, TextField } from "@/components/common";
import { Icon, Text } from "@/components/common";
import { rupees } from "@/lib/money";
import {
  listMyProducts,
  setProductAvailability,
  type ServerProduct,
} from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";

type Filter = "all" | "available" | "unavailable";

export function DashMenu() {
  const insets = useSafeAreaInsets();
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

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const toggle = async (product: ServerProduct) => {
    if (!session?.token) return;
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
    <Box style={{ flex: 1, backgroundColor: "#F4F6F8" }}>
      {/* ── TOP HEADER ────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <View>
          <Text style={styles.headerTitle}>Menu Management</Text>
          <Text style={styles.headerSub}>
            {products.length} Dish{products.length === 1 ? "" : "es"} · {availableCount} Active
          </Text>
        </View>

        <Pressable
          style={styles.addDishBtn}
          onPress={() => router.push("/product/new")}
        >
          <Icon name="plus" size={16} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.addDishText}>Add Dish</Text>
        </Pressable>
      </View>

      <Scroller
        contentContainerStyle={styles.scrollContent}
        refreshControl={<Refresher refreshing={loading} onRefresh={load} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        {/* ── SEARCH BAR ──────────────────────────────────────────────── */}
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color="#9CA3AF" />
          <TextField
            value={search}
            onChangeText={setSearch}
            placeholder="Search dishes or categories..."
            style={styles.searchInput}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")}>
              <Icon name="close" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        {/* ── STATUS FILTER PILLS ─────────────────────────────────────── */}
        <View style={styles.filterRow}>
          <Pressable
            style={[styles.filterPill, filter === "all" && styles.filterPillActive]}
            onPress={() => setFilter("all")}
          >
            <Text style={[styles.filterText, filter === "all" && styles.filterTextActive]}>
              All ({products.length})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterPill, filter === "available" && styles.filterPillActive]}
            onPress={() => setFilter("available")}
          >
            <Text style={[styles.filterText, filter === "available" && styles.filterTextActive]}>
              Available ({availableCount})
            </Text>
          </Pressable>

          <Pressable
            style={[styles.filterPill, filter === "unavailable" && styles.filterPillActive]}
            onPress={() => setFilter("unavailable")}
          >
            <Text style={[styles.filterText, filter === "unavailable" && styles.filterTextActive]}>
              Out of Stock ({outOfStockCount})
            </Text>
          </Pressable>
        </View>

        {/* ── CATEGORY HORIZONTAL SCROLL ──────────────────────────────── */}
        {categories.length > 2 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryBar}
          >
            {categories.map((cat) => (
              <Pressable
                key={cat}
                style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.catText, selectedCategory === cat && styles.catTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* ── NO DISHES EMPTY STATE ────────────────────────────────────── */}
        {!loading && products.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Icon name="utensils" size={32} color="#059669" />
            </View>
            <Text style={styles.emptyTitle}>No Dishes in Menu Yet</Text>
            <Text style={styles.emptySub}>
              Add your first dish to make your food menu live for hungry customers.
            </Text>
            <Pressable
              style={styles.emptyAddBtn}
              onPress={() => router.push("/product/new")}
            >
              <Icon name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.emptyAddText}>Add Your First Dish</Text>
            </Pressable>
          </View>
        )}

        {/* ── GROUPED DISH LIST ────────────────────────────────────────── */}
        {grouped.map((group) => (
          <View key={group.category} style={styles.groupContainer}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.category}</Text>
              <Text style={styles.groupCount}>{group.items.length} items</Text>
            </View>

            {group.items.map((item, index) => (
              <View
                key={item.productId}
                style={[
                  styles.dishRow,
                  index < group.items.length - 1 && styles.dishRowDivider,
                ]}
              >
                <Pressable
                  style={styles.dishMain}
                  onPress={() => router.push(`/product/${item.productId}`)}
                >
                  {/* Dish Image */}
                  {item.productImage?.url ? (
                    <Image source={{ uri: item.productImage.url }} style={styles.dishImage} />
                  ) : (
                    <View style={styles.dishImageFallback}>
                      <Icon name="image" size={20} color="#9CA3AF" />
                    </View>
                  )}

                  {/* Dish Details */}
                  <View style={styles.dishDetails}>
                    <View style={styles.dishTitleRow}>
                      {/* Veg / Non-Veg Indicator */}
                      <View
                        style={[
                          styles.vegSquare,
                          { borderColor: item.isVeg === "veg" ? "#16A34A" : "#DC2626" },
                        ]}
                      >
                        <View
                          style={[
                            styles.vegCircle,
                            { backgroundColor: item.isVeg === "veg" ? "#16A34A" : "#DC2626" },
                          ]}
                        />
                      </View>
                      <Text style={styles.dishName} numberOfLines={1}>
                        {item.productName}
                      </Text>
                    </View>

                    {/* Price Row */}
                    <View style={styles.priceRow}>
                      <Text style={styles.priceText}>
                        {rupees(item.discountedPrice || item.price)}
                      </Text>
                      {!!item.discountedPrice && (
                        <Text style={styles.originalPrice}>{rupees(item.price)}</Text>
                      )}
                    </View>

                    {/* Description or Tags */}
                    {!!item.description && (
                      <Text style={styles.dishDesc} numberOfLines={1}>
                        {item.description}
                      </Text>
                    )}
                  </View>

                  <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
                    <Icon name="edit" size={16} color="#059669" />
                  </View>
                </Pressable>

                {/* Footer Switch Row */}
                <View style={styles.dishFooter}>
                  <Text
                    style={[
                      styles.statusLabel,
                      { color: item.isAvailable ? "#059669" : "#DC2626" },
                    ]}
                  >
                    {pending[item.productId]
                      ? "Saving..."
                      : item.isAvailable
                      ? "● Available in menu"
                      : "○ Out of stock"}
                  </Text>

                  <Switch
                    value={item.isAvailable}
                    onValueChange={() => toggle(item)}
                    trackColor={{ false: "#E5E7EB", true: "#A7F3D0" }}
                    thumbColor={item.isAvailable ? "#059669" : "#9CA3AF"}
                  />
                </View>
              </View>
            ))}
          </View>
        ))}

        {products.length > 0 && grouped.length === 0 && (
          <Text style={styles.noMatchText}>No dishes match your search or filter.</Text>
        )}
      </Scroller>
    </Box>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  headerSub: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    marginTop: 2,
  },
  addDishBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#059669",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  addDishText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterPillActive: {
    backgroundColor: "#ECFDF5",
    borderColor: "#10B981",
  },
  filterText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },
  filterTextActive: {
    color: "#047857",
    fontWeight: "700",
  },
  categoryBar: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
  },
  catChipActive: {
    backgroundColor: "#059669",
  },
  catText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  catTextActive: {
    color: "#FFFFFF",
  },

  /* EMPTY CARD */
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  emptySub: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  emptyAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#059669",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 6,
  },
  emptyAddText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  /* GROUP CONTAINER */
  groupContainer: {
    gap: 4,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  groupCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },

  /* DISH ROW — a flat list row, not a card: no background, no shadow, no
     border radius. Rows are told apart by the divider below, not by each
     being its own floating surface. */
  dishRow: {
    paddingVertical: 14,
    gap: 12,
  },
  /* A fixed 1px rather than `StyleSheet.hairlineWidth` — hairline rounds to
     an unreliable, sometimes-invisible sub-pixel width on several Android
     densities, and the whole point of this line is that it's seen. */
  dishRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  dishMain: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  dishImage: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  dishImageFallback: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  dishDetails: {
    flex: 1,
    gap: 4,
  },
  dishTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  vegSquare: {
    width: 14,
    height: 14,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  vegCircle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dishName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  priceText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#059669",
  },
  originalPrice: {
    fontSize: 12,
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  dishDesc: {
    fontSize: 12,
    color: "#6B7280",
  },
  dishFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    paddingTop: 10,
    marginTop: 2,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  noMatchText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 20,
  },
});

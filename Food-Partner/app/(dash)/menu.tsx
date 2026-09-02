/* ══════════════════════════════════════════════════════════════════════════
   The menu manager.

   Reads `GET /me/products` — the restaurant's real rows out of
   `food_products` — grouped by category the way the partner arranged them.

   The availability toggle writes straight through on its own endpoint rather
   than opening the editor. That is the action a kitchen takes twenty times a
   service, from this list, with one hand: making it a round trip through a
   form is the difference between a control that gets used and one that does
   not. It updates optimistically and rolls back if the server refuses.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { Note, TextField } from "@/components/form";
import { Btn, Card, Chip, Icon, Seg, Text, Toggle, TopBar } from "@/components/ui";
import { rupees } from "@/lib/money";
import {
  listMyProducts,
  setProductAvailability,
  type ServerProduct,
} from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, radius, space, touch } from "@/theme";

type Filter = "all" | "available" | "unavailable";

export default function DashMenu() {
  const session = usePartnerStore((s) => s.session);

  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    /* A missing session must END the loading state, never skip past it — the
       same bug fixed in `(dash)/orders.tsx`: `loading` starts `true`, so an
       early return leaves a spinner turning over a blank screen with nothing
       saying why. Either the screen has data, or it says what is wrong. */
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

    // Optimistic: the point of this control is that it feels instant.
    setProducts((list) => list.map((p) => (p.productId === product.productId ? { ...p, isAvailable: next } : p)));
    setPending((p) => ({ ...p, [product.productId]: true }));

    try {
      await setProductAvailability(session.token, product.productId, next);
    } catch (err) {
      setProducts((list) =>
        list.map((p) => (p.productId === product.productId ? { ...p, isAvailable: !next } : p)),
      );
      setError((err as Error)?.message || "That did not save.");
    } finally {
      setPending((p) => ({ ...p, [product.productId]: false }));
    }
  };

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (filter === "available" && !p.isAvailable) return false;
      if (filter === "unavailable" && p.isAvailable) return false;
      if (needle && !`${p.productName} ${p.category}`.toLowerCase().includes(needle)) return false;
      return true;
    });

    return filtered.reduce<{ category: string; items: ServerProduct[] }[]>((acc, product) => {
      const bucket = acc.find((g) => g.category === product.category);
      if (bucket) bucket.items.push(product);
      else acc.push({ category: product.category, items: [product] });
      return acc;
    }, []);
  }, [products, search, filter]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        back={null}
        title="Menu"
        subtitle={`${products.length} item${products.length === 1 ? "" : "s"}`}
        actionGlyph="plus"
        onAction={() => router.push("/product/new")}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search the menu"
          right={<Icon name="search" size={16} color={colors.textTertiary} />}
        />

        <Seg
          options={["all", "available", "unavailable"] as const}
          value={filter}
          onChange={setFilter}
          labels={{ all: "All", available: "Available", unavailable: "Out of stock" }}
        />

        {!loading && products.length === 0 && (
          <Card style={{ alignItems: "center", gap: space[2], paddingVertical: space[6] }}>
            <Icon name="menu" size={26} color={colors.textTertiary} />
            <Text variant="title1">No dishes yet</Text>
            <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
              Nothing is stored against this restaurant. Add your first dish and it goes straight into
              the menu diners see.
            </Text>
            <Btn label="Add a dish" glyph="plus" onPress={() => router.push("/product/new")} />
          </Card>
        )}

        {groups.map((group) => (
          <View key={group.category} style={{ gap: space[2] }}>
            <Text variant="eyebrow" color="tertiary">
              {group.category} · {group.items.length}
            </Text>

            {group.items.map((item) => (
              <Card key={item.productId} style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.productName}`}
                  onPress={() => router.push(`/product/${item.productId}`)}
                  style={styles.rowMain}
                >
                  {item.productImage?.url ? (
                    <Image source={{ uri: item.productImage.url }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Icon name="image" size={16} color={colors.textTertiary} />
                    </View>
                  )}

                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
                      <View
                        style={[
                          styles.veg,
                          { borderColor: item.isVeg === "veg" ? colors.success.base : colors.danger.base },
                        ]}
                      >
                        <View
                          style={[
                            styles.vegDot,
                            { backgroundColor: item.isVeg === "veg" ? colors.success.base : colors.danger.base },
                          ]}
                        />
                      </View>
                      <Text variant="title2" style={{ flex: 1 }} numberOfLines={1}>
                        {item.productName}
                      </Text>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
                      <Text variant="priceMd">{rupees(item.discountedPrice || item.price)}</Text>
                      {!!item.discountedPrice && (
                        <Text
                          variant="priceSm"
                          color="tertiary"
                          style={{ textDecorationLine: "line-through" }}
                        >
                          {rupees(item.price)}
                        </Text>
                      )}
                      {!item.isAvailable && <Chip label="Out of stock" tone="muted" />}
                    </View>

                    {!!item.tags?.length && (
                      <Text variant="caption" color="brand" numberOfLines={1}>
                        {item.tags.join(" · ")}
                      </Text>
                    )}
                  </View>

                  <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                </Pressable>

                <View style={styles.toggleRow}>
                  <Text variant="caption" color="tertiary" style={{ flex: 1 }}>
                    {pending[item.productId] ? "Saving…" : item.isAvailable ? "Available" : "Out of stock"}
                  </Text>
                  <Toggle
                    value={item.isAvailable}
                    onChange={() => toggle(item)}
                    accessibilityLabel={`${item.productName} availability`}
                  />
                </View>
              </Card>
            ))}
          </View>
        ))}

        {products.length > 0 && groups.length === 0 && (
          <Text variant="body" color="tertiary" style={{ textAlign: "center" }}>
            Nothing matches that filter.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[3], paddingBottom: space[10] },
  row: { padding: space[3], gap: space[2] },
  rowMain: { flexDirection: "row", alignItems: "center", gap: space[3] },
  thumb: { width: 52, height: 52, borderRadius: radius.chip },
  thumbEmpty: {
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
  },
  veg: { width: 13, height: 13, borderWidth: 1.5, borderRadius: 3, alignItems: "center", justifyContent: "center" },
  vegDot: { width: 5, height: 5, borderRadius: radius.pill },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: space[2],
    minHeight: touch.min - 8,
  },
});

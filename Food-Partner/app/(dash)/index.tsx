/* ══════════════════════════════════════════════════════════════════════════
   Home — what a restaurant needs at a glance, mid-service.

   Everything here is read from `GET /me` and `GET /me/products`. Nothing is
   invented: there are no order counts or revenue figures on this screen
   because no orders collection is being written to yet, and a dashboard
   showing fabricated takings is worse than one that says what it does not
   know. The Orders tab says so in the same words.

   The availability control is the one thing a kitchen touches from here more
   than once a day, so it is the first thing under the header rather than
   buried in settings.
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { Note } from "@/components/form";
import { Card, Chip, Icon, Seg, Text, TopBar } from "@/components/ui";
import { OPEN_STATES, OPEN_STATE_LABELS } from "@/constants/partner";
import { rupees } from "@/lib/money";
import {
  getMe,
  listMyProducts,
  setAvailability,
  type ServerProduct,
  type ServerRestaurant,
} from "@/services/foodPartner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, radius, space, touch } from "@/theme";

export default function DashHome() {
  const session = usePartnerStore((s) => s.session);
  const syncFromServer = usePartnerStore((s) => s.syncFromServer);

  const [me, setMe] = useState<ServerRestaurant | null>(null);
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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
      const [restaurant, menu] = await Promise.all([
        getMe(session.token),
        listMyProducts(session.token),
      ]);
      setMe(restaurant);
      setProducts(menu);
      syncFromServer({
        restaurantId: restaurant.restaurantId,
        restaurantName: restaurant.restaurantName,
        verificationStatus: restaurant.verificationStatus,
        verificationNote: restaurant.verificationNote,
      });
    } catch (err) {
      setError((err as Error)?.message || "We could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [session?.token, syncFromServer]);

  /* Refetch on focus rather than on mount only: a partner comes back to this
     tab straight after editing a dish, and a stale count is the first thing
     they would notice. */
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const changeOpenState = async (next: "auto" | "open" | "closed") => {
    if (!session?.token || !me) return;
    const previous = me.openState;
    setMe({ ...me, openState: next });
    setSaving(true);
    try {
      const updated = await setAvailability(session.token, next);
      setMe(updated);
    } catch (err) {
      setMe({ ...me, openState: previous });
      setError((err as Error)?.message || "That did not save.");
    } finally {
      setSaving(false);
    }
  };

  const unavailable = products.filter((p) => !p.isAvailable).length;
  const openNow = me?.isCurrentlyOpen;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        back={null}
        title={me?.restaurantName || session?.restaurantName || "Your restaurant"}
        subtitle={me?.restaurantId}
      />

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        {me?.verificationStatus !== "approved" && !!me && (
          <Pressable accessibilityRole="button" onPress={() => router.push("/status")}>
            <Note tone="warn">
              This restaurant is not approved yet, so it is not shown to diners. Tap to see where the
              application has got to.
            </Note>
          </Pressable>
        )}

        {/* ── Availability ─────────────────────────────────────────────── */}
        <Card style={{ gap: space[3] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
            <Text variant="title1" style={{ flex: 1 }}>
              Taking orders
            </Text>
            {typeof openNow === "boolean" && (
              <Chip
                label={openNow ? "Open now" : "Closed"}
                tone={openNow ? "success" : "muted"}
                glyph={openNow ? "check" : "clock"}
              />
            )}
          </View>
          <Seg
            options={OPEN_STATES}
            value={(me?.openState ?? "auto") as "auto" | "open" | "closed"}
            onChange={changeOpenState}
            labels={OPEN_STATE_LABELS}
          />
          <Text variant="caption" color="tertiary">
            {saving
              ? "Saving…"
              : "Schedule follows your opening hours. A manual choice beats it until you set it back."}
          </Text>
        </Card>

        {/* ── The numbers we actually have ─────────────────────────────── */}
        <View style={styles.grid}>
          <Tile
            glyph="menu"
            label="On the menu"
            value={String(products.length)}
            onPress={() => router.push("/(dash)/menu")}
          />
          <Tile
            glyph="alert"
            label="Out of stock"
            value={String(unavailable)}
            tone={unavailable > 0 ? colors.warning.ink : undefined}
            onPress={() => router.push("/(dash)/menu")}
          />
          <Tile glyph="clock" label="Prep time" value={`${me?.avgPreparationTime ?? "—"} min`} />
          <Tile glyph="truck" label="Delivers" value={`${me?.deliveryRadiusKm ?? "—"} km`} />
          <Tile glyph="rupee" label="Min order" value={rupees(me?.minOrderValue ?? 0)} />
          <Tile
            glyph="star"
            label="Rating"
            value={me?.ratingCount ? `${me.ratingAvg?.toFixed(1)} · ${me.ratingCount}` : "No ratings yet"}
          />
        </View>

        {/* ── Today's hours ────────────────────────────────────────────── */}
        <Card style={{ gap: space[2] }}>
          <Text variant="title1">Opening hours</Text>
          {me?.openingHours?.length ? (
            Object.entries(
              me.openingHours.reduce<Record<string, string[]>>((acc, h) => {
                acc[h.day] = [...(acc[h.day] || []), `${h.openTime}–${h.closeTime}`];
                return acc;
              }, {}),
            ).map(([day, slots]) => (
              <View key={day} style={styles.hourRow}>
                <Text variant="body" color="secondary" style={{ flex: 1 }}>
                  {day}
                </Text>
                <Text variant="priceSm">{slots.join(", ")}</Text>
              </View>
            ))
          ) : (
            <Text variant="body" color="tertiary">
              No hours on file.
            </Text>
          )}
        </Card>
      </ScrollView>
    </View>
  );
}

function Tile({
  glyph,
  label,
  value,
  tone,
  onPress,
}: {
  glyph: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  tone?: string;
  onPress?: () => void;
}) {
  const body = (
    <Card style={styles.tile}>
      <Icon name={glyph} size={16} color={tone ?? colors.brandInk} />
      <Text variant="priceLg" style={tone ? { color: tone } : undefined}>
        {value}
      </Text>
      <Text variant="caption" color="tertiary">
        {label}
      </Text>
    </Card>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flexBasis: "47%", flexGrow: 1 }}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[4], paddingBottom: space[10] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  tile: { flexBasis: "47%", flexGrow: 1, gap: space[1], padding: space[3], borderRadius: radius.card },
  hourRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: touch.min - 12 },
});

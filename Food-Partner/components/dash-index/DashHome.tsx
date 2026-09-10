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
import {
  StyleSheet,
} from "react-native";

import { Box, Note, Refresher, Scroller, Tappable } from "@/components/common";
import { Card, Chip, Icon, Seg, Text, TopBar } from "@/components/common";
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
import { Tile } from "@/components/dash-index/molecules/Tile";

export function DashHome() {
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
    <Box style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar
        back={null}
        title={me?.restaurantName || session?.restaurantName || "Your restaurant"}
        subtitle={me?.restaurantId}
      />

      <Scroller
        contentContainerStyle={styles.body}
        refreshControl={<Refresher refreshing={loading} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {!!error && <Note tone="bad">{error}</Note>}

        {me?.verificationStatus !== "approved" && !!me && (
          <Tappable accessibilityRole="button" onPress={() => router.push("/status")}>
            <Note tone="warn">
              This restaurant is not approved yet, so it is not shown to diners. Tap to see where the
              application has got to.
            </Note>
          </Tappable>
        )}

        {/* ── Availability ─────────────────────────────────────────────── */}
        <Card style={{ gap: space[3] }}>
          <Box style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
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
          </Box>
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
        <Box style={styles.grid}>
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
        </Box>

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
              <Box key={day} style={styles.hourRow}>
                <Text variant="body" color="secondary" style={{ flex: 1 }}>
                  {day}
                </Text>
                <Text variant="priceSm">{slots.join(", ")}</Text>
              </Box>
            ))
          ) : (
            <Text variant="body" color="tertiary">
              No hours on file.
            </Text>
          )}
        </Card>
      </Scroller>
    </Box>
  );
}

const styles = StyleSheet.create({
  body: { padding: layout.gutter, gap: space[4], paddingBottom: space[10] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  hourRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: touch.min - 12 },
});

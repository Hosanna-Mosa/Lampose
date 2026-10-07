/* A table request arriving, said on whatever screen the kitchen has open.

   The order equivalent slides a whole sheet up (`new-order`); a table request
   gets a banner instead, because it is answered from a list rather than from
   one ticket, and a sheet over a cook mid-order is too much for something that
   has fifteen minutes. It rides the chime the table pump has already played —
   this is what the chime was ABOUT — and goes away on its own, since the
   Dine-in tab carries the waiting count either way. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { openTableBookings } from "@/components/dash/utils/shared";
import { BrandBanner, fadeInDown, fadeOut } from "@/components/ui";
import { onTableRequest, type TableArrival } from "@/services/tablePump";

/** Long enough to look up from the pass and read it. */
const SHOW_MS = 15_000;

const guests = (n: number) => `${n} guest${n === 1 ? "" : "s"}`;

export function TableRequestToast() {
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<{ count: number; latest: TableArrival["latest"] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setShown(null);
  }, []);

  useEffect(
    () =>
      onTableRequest((arrival) => {
        /* A second request while the first is still up adds to it rather than
           replacing it — "2 new table requests" is the true sentence. */
        setShown((prev) => ({ count: (prev?.count ?? 0) + arrival.count, latest: arrival.latest }));
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(hide, SHOW_MS);
      }),
    [hide],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!shown) return null;

  /* Named only when there is exactly one, and the socket said who — the poll
     knows how many arrived, not whose they are. */
  const one = shown.count === 1 ? shown.latest : null;
  const minutesLeft = one
    ? Math.max(1, Math.round((Date.parse(one.respondBy) - Date.now()) / 60_000) || 15)
    : 15;

  return (
    <Animated.View
      entering={fadeInDown(0)}
      exiting={fadeOut}
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <BrandBanner
        icon="restaurant"
        title={
          one
            ? `Table request · ${guests(one.partySize)}`
            : `${shown.count} new table request${shown.count === 1 ? "" : "s"}`
        }
        subtitle={
          one
            ? `${one.guestName || "A diner"} · answer within ${minutesLeft} min`
            : `Answer within ${minutesLeft} minutes.`
        }
        actionLabel="View"
        onPress={() => {
          hide();
          openTableBookings();
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16 },
});

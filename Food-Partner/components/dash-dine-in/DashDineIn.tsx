/* ══════════════════════════════════════════════════════════════════════════
   The Dine-in tab — table bookings, and the way into their settings.

   Its own tab rather than a half of Orders: a table request is answered
   against its own fifteen-minute clock, and a kitchen that takes no table
   bookings should never have to look past them to find its orders.

   The lists themselves (Requests / Upcoming / Past, the countdown, the
   accept / decline / arrived / no-show buttons) are `TableBookings`; this
   screen is the title, the count of requests waiting, and the gear that
   opens the dine-in settings (`/dine-in`).
   ══════════════════════════════════════════════════════════════════════════ */
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TableBookings } from "@/components/dash-orders/TableBookings";
import { IconButton, ScreenShell, ScreenTitle } from "@/components/ui";
import { onTableCount, pendingTableRequests } from "@/services/tablePump";

export function DashDineIn() {
  const insets = useSafeAreaInsets();

  /* `at` changes on every `openTableBookings` call (a push tap, the toast),
     so a second tap still brings the lists back to Requests. */
  const params = useLocalSearchParams<{ at?: string }>();

  /* Requests waiting, from the pump — right even before the lists load. */
  const [waiting, setWaiting] = useState(pendingTableRequests);
  useEffect(() => onTableCount(setWaiting), []);

  return (
    <ScreenShell style={{ paddingTop: insets.top + 12 }}>
      <ScreenTitle
        title="Dine-in"
        subtitle={waiting ? `${waiting} table request${waiting === 1 ? "" : "s"} waiting` : undefined}
        right={
          <IconButton
            icon="settings-outline"
            accessibilityLabel="Dine-in settings"
            onPress={() => router.push("/dine-in")}
          />
        }
      />
      <TableBookings openAt={params.at} />
    </ScreenShell>
  );
}

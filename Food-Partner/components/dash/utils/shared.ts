/* Declarations shared between this screen and a component extracted out of it
   in phase 4. Contents unchanged. */
import { router } from "expo-router";

import { Icon, Text, type IconName } from "@/components/common";

export const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: "index", label: "Home", icon: "home" },
  { name: "menu", label: "Menu", icon: "menu" },
  { name: "orders", label: "Orders", icon: "doc" },
  /* Table bookings — its own tab, beside Orders. The route is `tables`
     because `/dine-in` is the settings screen this tab opens. */
  { name: "tables", label: "Dine-in", icon: "calendar" },
  { name: "profile", label: "Profile", icon: "profile" },
];

/**
 * The Dine-in tab — from a push tap, the toast, or anywhere else.
 *
 * `navigate`, not `push`: from a screen stacked over the dashboard (support,
 * payouts) a push would stack a SECOND dashboard on the root stack, while
 * navigate goes back to the one already there and switches tab. `at` makes
 * every call a new value, so the tab reacts even when it is already showing.
 */
export const openTableBookings = () =>
  router.navigate({ pathname: "/(dash)/tables", params: { at: String(Date.now()) } });

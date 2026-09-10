import { RefreshControl, type RefreshControlProps } from "react-native";

import { colors } from "@/theme";

/**
 * Pull-to-refresh, in the brand colour.
 *
 * The same three-prop `RefreshControl` was written out on seven screens — the
 * dashboard's four tabs and all three support screens — identical every time,
 * down to the tint. This is that, once.
 *
 * `tintColor` is the only thing it decides; `refreshing` and `onRefresh` stay the
 * caller's, because each screen already has its own loading flag and loader and
 * this is not the place to change how either behaves.
 */
export const Refresher = (props: Omit<RefreshControlProps, "tintColor">) => (
  <RefreshControl tintColor={colors.brand} {...props} />
);

/* The sheet stylesheet. Both ConfirmSheet and ModalSheet drew on it when they
   lived in one file; splitting them copied it, so this puts it back to one. */
import { pill } from "@/components/common/utils/sharedStyles";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, elevation, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";

export const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: layout.gutter + space[1],
    paddingTop: space[2],
    ...elevation.sheet,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: space[3],
  },
  head: { flexDirection: "row", alignItems: "center", gap: space[2], marginBottom: space[3] },
  foot: { paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  kicker: pill,
});

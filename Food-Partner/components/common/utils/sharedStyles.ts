/* Style objects that were written out identically in two or more stylesheets.

   Each was compared property-by-property before merging, and every call site keeps
   its OWN key name — `link` is still `link` — so nothing was renamed. Only the
   duplicated value moved. */
import { StyleSheet } from "react-native";
import { colors, radius, space, touch } from "@/theme";

/** An inline tappable row: icon beside a word, at the minimum touch size. */
export const tappableRow = {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    minHeight: touch.min,
    borderRadius: radius.chip,
} as const;

/** A centred row of two short pieces of text, one of them tappable. */
export const centredLinkRow = {
    flexDirection: "row",
    justifyContent: "center",
    gap: space[2],
    minHeight: touch.min,
    alignItems: "center",
} as const;

/** The 36x36 brand-tinted, hairline-bordered badge an icon sits in. */
export const iconBadge = {
    width: 36,
    height: 36,
    borderRadius: radius.button,
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    alignItems: "center",
    justifyContent: "center",
} as const;

/** A bordered row shaped like a text input, for things that open a picker. */
export const inputLikeRow = {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    minHeight: touch.min,
} as const;

/** A small pill: hairline-bordered, icon-and-word, hugging its content. */
export const pill = {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    paddingHorizontal: space[2],
    paddingVertical: 4,
} as const;

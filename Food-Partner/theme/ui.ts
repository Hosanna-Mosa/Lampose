/**
 * The signed-in screens' design layer.
 *
 * Home, Orders, Menu, Profile, the dish editor, the new-order alert, payouts,
 * support, delete-account and the not-found screen are laid out the way the
 * Adios partner app lays out its own: floating pill tab bar, 22pt cards with
 * icon tiles, uppercase section labels, a four-step type scale in Familjen
 * Grotesk (headings) and Figtree (everything else), Ionicons.
 *
 * The COLOURS are not Adios's. Every value below is read from `theme/index.ts`,
 * so the brand stays Lampose green on the Lampose grey ground and the same
 * contrast rules apply — green as a fill carries near-black ink (`onBrand`),
 * green as text is `brandInk`, and a status's text is its `ink` step.
 *
 * Sign-in, the pitch screen, onboarding, "submitted" and the application
 * status screen do not read this file; they stay on `theme/index.ts` and the
 * `components/common` kit.
 */
import { Dimensions, Platform, type ViewStyle } from "react-native";

import { dietColor } from "@/lib/diet";
import { MAX_FONT_SCALE, colors } from "@/theme";

/* ------------------------------------------------------------------ *
 * Scaling
 * ------------------------------------------------------------------ */

const window = Dimensions.get("window");
const shortSide = Math.min(window.width, window.height);

/**
 * `moderateScale` from react-native-size-matters, which the Adios app sizes
 * with: half of the difference between the guideline (350pt wide) and this
 * screen, so a value grows a little on a wide phone and shrinks a little on a
 * narrow one. Inlined rather than added as a dependency for one line.
 */
export const ms = (size: number, factor = 0.5) => size + ((shortSide / 350) * size - size) * factor;

/* ------------------------------------------------------------------ *
 * Colour roles, in the Adios component vocabulary
 * ------------------------------------------------------------------ */

export const ui = {
  bg: colors.bg,
  surface: colors.surface,
  sunken: colors.surfaceSunken,
  border: colors.border,
  borderSubtle: colors.borderSubtle,
  /** Off-state switch track, dashed rules, the edge of an input. */
  borderStrong: colors.borderInput,

  text: colors.textPrimary,
  sec: colors.textSecondary,
  muted: colors.textTertiary,

  /** Green as a FILL — buttons, the selected chip, the send button. */
  brand: colors.brand,
  brandPressed: colors.brandPressed,
  /** Green as TEXT or a glyph on white or on `brandSkin`. */
  brandInk: colors.brandInk,
  brandSkin: colors.brandTint,
  /** Ink on a `brand` fill. Near-black, per the theme's contrast note. */
  onBrand: colors.onBrand,

  success: colors.success.ink,
  successSolid: colors.success.base,
  successSkin: colors.success.tint,
  warning: colors.warning.ink,
  warningSolid: colors.warning.base,
  warningSkin: colors.warning.tint,
  error: colors.danger.ink,
  errorSolid: colors.danger.base,
  errorSkin: colors.danger.tint,
  info: colors.info.ink,
  infoSkin: colors.info.tint,

  veg: dietColor("veg"),
  egg: dietColor("egg"),
  nonveg: dietColor("non-veg"),

  overlay: colors.scrim,
  white: colors.white,
} as const;

export type UiTone = "brand" | "success" | "warning" | "error" | "neutral" | "info";

/** A tone's glyph/text colour and its tinted background. */
export const toneColors: Record<UiTone, { fg: string; bg: string }> = {
  brand: { fg: ui.brandInk, bg: ui.brandSkin },
  success: { fg: ui.success, bg: ui.successSkin },
  warning: { fg: ui.warning, bg: ui.warningSkin },
  error: { fg: ui.error, bg: ui.errorSkin },
  neutral: { fg: ui.sec, bg: ui.sunken },
  info: { fg: ui.info, bg: ui.infoSkin },
};

/** The theme's `ToneName`s (what services and status tables speak) onto these. */
export const fromToneName = (name: string): UiTone =>
  name === "danger" ? "error" : name === "muted" ? "neutral" : (name as UiTone) in toneColors ? (name as UiTone) : "neutral";

/* ------------------------------------------------------------------ *
 * Type
 * ------------------------------------------------------------------ */

/** Each weight is its own registered family — see `app/_layout.tsx`. */
export const font = {
  heading: {
    regular: "FamiljenGrotesk_400Regular",
    medium: "FamiljenGrotesk_500Medium",
    semibold: "FamiljenGrotesk_600SemiBold",
    bold: "FamiljenGrotesk_700Bold",
  },
  body: {
    regular: "Figtree_400Regular",
    medium: "Figtree_500Medium",
    semibold: "Figtree_600SemiBold",
    bold: "Figtree_700Bold",
  },
} as const;

/**
 * The four text sizes, and a line height per size. There is no fifth.
 *
 * One step below the Adios scale (12 / 14 / 18 / 24). Every screen drawn from
 * this file shrinks together, so the relationships between heading, body and
 * caption stay the same.
 */
export const size = {
  small: ms(11),
  medium: ms(13),
  large: ms(16),
  extraLarge: ms(20),
} as const;

export const line = {
  small: ms(15),
  medium: ms(18),
  large: ms(22),
  extraLarge: ms(26),
} as const;

/** The same OS font-scaling cap the rest of the app uses. */
export { MAX_FONT_SCALE };

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

/* The theme's shadow colour, at the Adios offsets and spreads. */
const shade = (y: number, opacity: number, blur: number, elev: number): ViewStyle =>
  Platform.select<ViewStyle>({
    android: { elevation: elev, shadowColor: "#10151C" },
    default: { shadowColor: "#10151C", shadowOffset: { width: 0, height: y }, shadowOpacity: opacity, shadowRadius: blur },
  })!;

export const elevation = {
  sm: shade(2, 0.06, 8, 2),
  md: shade(6, 0.1, 20, 6),
  lg: shade(12, 0.14, 32, 12),
} as const;

/**
 * Lampose Tracker — design tokens.
 *
 * Deliberately small: this app has three screens, and a token set sized for
 * that is easier to keep coherent than one borrowed wholesale from a bigger
 * app and mostly unused. Grow it if a fourth screen actually needs a token
 * that is not here yet, rather than in advance of one.
 */
export const colors = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceSunken: "#F3F4F6",

  textPrimary: "#111827",
  textSecondary: "#4B5563",
  textTertiary: "#9CA3AF",

  border: "#E5E7EB",
  borderInput: "#D1D5DB",

  /* The one saturated colour, matching the rest of the Lampose product
     family's green rather than inventing a second brand for a third app. */
  brand: "#059669",
  brandPressed: "#047857",
  brandTint: "#ECFDF5",
  onBrand: "#FFFFFF",

  danger: "#DC2626",
  dangerTint: "#FEF2F2",

  online: "#059669",
  offline: "#9CA3AF",
} as const;

export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48] as const;

export const radius = {
  button: 14,
  card: 16,
  pill: 999,
} as const;

export const layout = {
  gutter: 20,
} as const;

export const touch = {
  min: 44,
} as const;

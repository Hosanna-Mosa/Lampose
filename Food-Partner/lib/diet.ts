/**
 * The diet mark's colour: green veg, amber egg, red non-veg.
 *
 * Egg used to be drawn with the non-veg red on every screen — the menu, the
 * new-order alert and onboarding — so a kitchen and its diners read an egg
 * dish as meat. One function so the three screens cannot disagree again.
 */
export const dietColor = (isVeg?: string | null): string =>
  isVeg === "egg" ? "#B8860B" : isVeg === "non-veg" ? "#DC2626" : "#16A34A";

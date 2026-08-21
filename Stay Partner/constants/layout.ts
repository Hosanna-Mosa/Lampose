/**
 * LAMPOSE Stay Partner — spacing, radii, and layout constants.
 * 4px base unit, per section 3 of the design system.
 */

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  control: 10, // buttons and inputs
  chip: 12,
  card: 16,
  sheet: 22,
  pill: 999,
} as const;

export const layout = {
  /** Screen side margin */
  screenX: 20,
  /** Gap between stacked cards */
  cardGap: 12,
  /** Card internal padding */
  cardPadding: 16,
  /** Gap between major sections */
  sectionGap: 32,
  /** Minimum touch target — enforced even where the designs draw smaller controls */
  touchMin: 44,
  /** Icon grid */
  icon: 24,
  /** Top header height */
  headerHeight: 64,
  /** Bottom tab bar height, before safe-area inset */
  tabBarHeight: 64,
  /** Default control heights */
  controlHeight: 52,
  controlHeightSm: 40,
} as const;

/** Card elevation, matching the design system's two-layer shadow. */
export const shadow = {
  card: {
    shadowColor: '#1A1917',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  sheet: {
    shadowColor: '#1A1917',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 30,
    elevation: 16,
  },
} as const;

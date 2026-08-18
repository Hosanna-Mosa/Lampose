import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import {
  AirVent,
  AlertTriangle,
  Archive,
  ArrowUpDown,
  Ban,
  Bell,
  Bike,
  Bookmark,
  Calendar,
  Car,
  Cctv,
  Check,
  // Aliased: `react-native-svg` also exports a `Circle`, and the custom glyphs
  // below draw with it.
  Circle as CircleGlyph,
  ChevronLeft,
  ChevronRight,
  Clock,
  CupSoda,
  Droplets,
  Dumbbell,
  FileText,
  Footprints,
  House,
  IndianRupee,
  LampDesk,
  LogIn,
  LogOut,
  MapPin,
  Phone,
  Refrigerator,
  RotateCcw,
  Search,
  Shirt,
  ShieldCheck,
  SlidersHorizontal,
  SprayCan,
  Star,
  Tv,
  UserCheck,
  Users,
  Wifi,
  X,
  type LucideProps,
} from 'lucide-react-native';

import { useTheme } from '@/context/ThemeContext';

/**
 * Icon strategy: Lucide as the base, six custom glyphs.
 *
 * Lucide already matches this system's stroke precision — a 24px grid, round
 * joins, and a strokeWidth prop that takes the 1.5 / 1.75 / 2 values directly.
 * Hand-drawing the generic set would be days of work for no return.
 *
 * The six custom glyphs below are the ones worth drawing, because they are the
 * fields students actually decide on and no icon library carries them. They
 * ship with the same prop signature as the Lucide ones, so swapping a
 * placeholder for a final drawing is a one-line change.
 */

/** Stroke width is tied to size — they are not independently choosable. */
const STROKE_BY_SIZE: Record<number, number> = { 16: 1.5, 20: 1.5, 24: 1.75, 26: 2, 28: 2 };

export type IconSize = 16 | 20 | 24 | 26 | 28;

function strokeFor(size: number): number {
  return STROKE_BY_SIZE[size] ?? 1.75;
}

/* ------------------------------------------------------------------ *
 * Custom glyphs
 * ------------------------------------------------------------------ */

type GlyphProps = { size: number; color: string; strokeWidth: number };

const common = (p: GlyphProps) => ({
  stroke: p.color,
  strokeWidth: p.strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
});

/** A plate with cutlery — meals included, the first thing a PG is judged on. */
function MessGlyph(p: GlyphProps) {
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Circle cx={12} cy={13} r={6.5} {...common(p)} />
      <Circle cx={12} cy={13} r={3} {...common(p)} />
      <Path d="M4 3v5.5M6.5 3v5.5M19.5 3v4a2.5 2.5 0 0 1-2 2.4" {...common(p)} />
    </Svg>
  );
}

/** A battery with a bolt — power backup during a load-shedding evening. */
function PowerBackupGlyph(p: GlyphProps) {
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Rect x={2} y={7} width={16} height={10} rx={2.5} {...common(p)} />
      <Path d="M21 11v2" {...common(p)} />
      <Path d="M11 9.5 8.5 13h3L9 16.5" {...common(p)} />
    </Svg>
  );
}

/** A tap with a drop — 24-hour water, which is not a given here. */
function WaterSupplyGlyph(p: GlyphProps) {
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M4 5h6v5H4z" {...common(p)} />
      <Path d="M10 7.5h5a2 2 0 0 1 2 2V12" {...common(p)} />
      <Path d="M17 15.5c0 1.1-.9 2-2 2s-2-.9-2-2c0-1.2 2-3.5 2-3.5s2 2.3 2 3.5z" {...common(p)} />
      <Path d="M5.5 10v9" {...common(p)} />
    </Svg>
  );
}

/** A person behind a desk — a warden on site, which parents ask about first. */
function WardenGlyph(p: GlyphProps) {
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Circle cx={12} cy={7} r={3} {...common(p)} />
      <Path d="M7 14.5a5 5 0 0 1 10 0" {...common(p)} />
      <Path d="M3 17.5h18M5 17.5V21M19 17.5V21" {...common(p)} />
    </Svg>
  );
}

/** A clock inside a gate — the entry curfew, the rule students check for. */
function CurfewGlyph(p: GlyphProps) {
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M3 21V6a3 3 0 0 1 3-3h5" {...common(p)} />
      <Path d="M3 21h8" {...common(p)} />
      <Circle cx={16.5} cy={14} r={5} {...common(p)} />
      <Path d="M16.5 11.5V14l1.75 1.25" {...common(p)} />
    </Svg>
  );
}

/** A shower over a door — an attached bathroom, versus a shared corridor one. */
function AttachedBathGlyph(p: GlyphProps) {
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M4 4v7a4 4 0 0 0 4 4h9" {...common(p)} />
      <Path d="M17 10h4v10a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1z" {...common(p)} />
      <Line x1={7} y1={18} x2={7} y2={20} {...common(p)} />
      <Line x1={11} y1={18} x2={11} y2={20} {...common(p)} />
    </Svg>
  );
}

/**
 * A price tag with a percent — the offer mark.
 *
 * The seventh custom glyph, and it is here for the same reason as the other
 * six: the concept is central to this product and no icon library carries a
 * version of it that reads correctly here. Lucide's `tag` is a plain label with
 * a punch hole, which in an accommodation app reads as a category, not a
 * discount. The percent inside is what makes it an offer at a glance — and a
 * glance is the whole requirement, because the strip this sits on has to be
 * understood by someone who has not read the words next to it.
 *
 * The percent is drawn rather than typed. A "%" character would inherit the
 * body face's metrics and land off-centre inside the tag at half the sizes it
 * gets rendered at.
 */
function OfferGlyph(p: GlyphProps) {
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      {/* The tag body, punch hole at the narrow end. */}
      <Path
        d="M11.6 2.6H20a1.4 1.4 0 0 1 1.4 1.4v8.4a1.4 1.4 0 0 1-.41.99l-8.6 8.6a1.4 1.4 0 0 1-1.98 0l-8.4-8.4a1.4 1.4 0 0 1 0-1.98l8.6-8.6a1.4 1.4 0 0 1 .99-.41z"
        {...common(p)}
      />
      <Circle cx={17} cy={7} r={1.1} {...common(p)} />
      {/* The percent: two counters and the stroke between them. */}
      <Circle cx={9.4} cy={11.4} r={1.15} {...common(p)} />
      <Circle cx={13.6} cy={15.6} r={1.15} {...common(p)} />
      <Path d="M14.2 10.8 8.8 16.2" {...common(p)} />
    </Svg>
  );
}

/**
 * A steaming bowl on its base — the Food module's tab glyph.
 *
 * Distinct from `mess` deliberately: `mess` is an *amenity* mark ("meals
 * included" on a PG), while this is a *destination* — the door to the whole
 * Food module. Reusing the amenity glyph would make the tab read as a filter.
 */
function FoodGlyph(p: GlyphProps) {
  return (
    <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
      <Path d="M4 11h16a8 8 0 0 1-16 0z" {...common(p)} />
      <Path d="M9 7c0-1.5 1-1.5 1-3M14 7c0-1.5 1-1.5 1-3" {...common(p)} />
      <Path d="M8 21h8M12 19v2" {...common(p)} />
    </Svg>
  );
}

const CUSTOM_GLYPHS = {
  mess: MessGlyph,
  food: FoodGlyph,
  offer: OfferGlyph,
  powerBackup: PowerBackupGlyph,
  waterSupply: WaterSupplyGlyph,
  warden: WardenGlyph,
  curfew: CurfewGlyph,
  attachedBath: AttachedBathGlyph,
} as const;

/* ------------------------------------------------------------------ *
 * Lucide set
 * ------------------------------------------------------------------ */

const LUCIDE_GLYPHS = {
  wifi: Wifi,
  laundry: Shirt,
  sharing: Users,
  mapPin: MapPin,
  home: House,
  search: Search,
  filters: SlidersHorizontal,
  bookmark: Bookmark,
  phone: Phone,
  calendar: Calendar,
  clock: Clock,
  bell: Bell,
  verified: ShieldCheck,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  close: X,
  check: Check,
  alert: AlertTriangle,
  star: Star,
  commute: Car,
  retry: RotateCcw,

  // Batch 3 — the rest of the 22-icon amenity set. The six market-specific
  // glyphs it also needs are the custom ones above; these are the generic
  // half, where a drawn-from-scratch icon would buy nothing. (`offer`, the
  // seventh custom glyph, is not an amenity and is not part of that 22.)
  ac: AirVent,
  studyTable: LampDesk,
  cupboard: Archive,
  parking: Bike,
  cctv: Cctv,
  housekeeping: SprayCan,
  hotWater: Droplets,
  lift: ArrowUpDown,
  tv: Tv,
  fridge: Refrigerator,
  gym: Dumbbell,
  visitors: UserCheck,
  drinkingWater: CupSoda,
  bicycle: Bike,
  walk: Footprints,

  // Batch 4 — the booking state machine's glyphs. Each of the thirteen
  // statuses is identified by its glyph before its colour, so these are load
  // bearing rather than ornamental.
  checkedIn: LogIn,
  checkedOut: LogOut,
  completed: CircleGlyph,
  expired: Ban,
  rupee: IndianRupee,
  agreement: FileText,
} as const satisfies Record<string, React.ComponentType<LucideProps>>;

export type IconName = keyof typeof LUCIDE_GLYPHS | keyof typeof CUSTOM_GLYPHS;

export type IconProps = {
  name: IconName;
  size?: IconSize;
  /**
   * A resolved colour string. Callers pass a theme token, never a raw hex —
   * an icon that only works in light mode is the usual way dark mode breaks.
   */
  color?: string;
  fill?: string;
};

/**
 * The only way an icon enters a screen.
 *
 * Note what this component does not offer: a way to label something by icon
 * alone. Money and status always carry words as well, because colour and shape
 * are not available to every reader.
 */
export function Icon({ name, size = 24, color, fill }: IconProps) {
  const { colors } = useTheme();
  const resolved = color ?? colors.textPrimary;
  const strokeWidth = strokeFor(size);

  if (name in CUSTOM_GLYPHS) {
    const Glyph = CUSTOM_GLYPHS[name as keyof typeof CUSTOM_GLYPHS];
    return <Glyph size={size} color={resolved} strokeWidth={strokeWidth} />;
  }

  const Glyph = LUCIDE_GLYPHS[name as keyof typeof LUCIDE_GLYPHS];
  return <Glyph size={size} color={resolved} fill={fill ?? 'none'} strokeWidth={strokeWidth} absoluteStrokeWidth />;
}

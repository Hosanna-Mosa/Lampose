/**
 * Discovery components — Batch 3.
 *
 * The parts a student uses to find a place, as opposed to the parts they use
 * to book one. Everything here composes `components/ui` primitives; nothing
 * re-implements a button, a chip or a price.
 *
 * The load-bearing rule for this folder: `RentDisplay` is used unmodified
 * everywhere, which is what keeps the card → detail shared-element flight
 * alive. Cards are sparse — a card simply passes no deposit.
 */

export {
  DepositBadge,
  GenderBadge,
  type DepositBadgeProps,
  type GenderBadgeProps,
} from './Badges';

/**
 * Kept, unused by home since the category became a required filter — the feed
 * is one category and renders a vertical list. Still the right component for a
 * cross-category surface (a "similar in other categories" row, a saved-search
 * digest) if one is ever built.
 */
export { CategoryCarousel, type CategoryCarouselProps } from './CategoryCarousel';

export { FilterSheet, type FilterSheetProps } from './FilterSheet';

export { SortSheet, type SortSheetProps } from './SortSheet';

export { DirectionsButton, type DirectionsButtonProps } from './DirectionsButton';

export { PhotoGallery, type PhotoGalleryProps, type PhotoGroup } from './PhotoGallery';

/** The detail screen's hero. Swipe-driven, and deliberately never automatic. */
export { HeroCarousel, type HeroCarouselProps } from './HeroCarousel';

export { SavedRow, type SavedRowProps, type SavedEntry } from './SavedRow';

export {
  CategoryTabs,
  CATEGORY_BLURB,
  CATEGORY_TILE_BLURB,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type CategoryTabsProps,
} from './CategoryTabs';

export {
  ListingCard,
  ListingCardSkeleton,
  AvailabilityChip,
  type ListingCardProps,
  type ListingCardVariant,
} from './ListingCard';

export {
  SharingTypeSelector,
  defaultSharingSelection,
  type SharingTypeSelectorProps,
} from './SharingTypeSelector';

export {
  AmenityIcon,
  AmenityRow,
  AmenityGrid,
  AMENITY_ICON,
  AMENITY_LABEL,
  CATEGORY_AMENITY_PRIORITY,
  type AmenityIconProps,
  type AmenityRowProps,
} from './AmenityIcon';

export {
  MealPlanCard,
  HouseRulesRow,
  type MealPlanCardProps,
  type HouseRulesRowProps,
} from './PlaceFacts';

export {
  FilterChipRow,
  DEFAULT_FILTER_ORDER,
  type FilterChip,
  type FilterChipRowProps,
} from './FilterChipRow';


export { MoveInBreakdown, type MoveInBreakdownProps } from './MoveInBreakdown';

/**
 * PG and hostel price by stay length now, so the listing asks how long rather
 * than which bed. Bed choice moved to the request, where it is committed to.
 */
export {
  StayIntentSelector,
  stayTotals,
  stayIntentComplete,
  unitPrice,
  sharingAtRate,
  trackOf,
  STAY_TRACK_LABEL,
  type StayIntentSelectorProps,
  type StayIntent,
  type StayTrack,
} from './StayIntentSelector';

export { HotelStaySelector, type HotelIntent, type HotelRateStructure } from './HotelStaySelector';

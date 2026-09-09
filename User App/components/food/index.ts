/**
 * The Food module.
 *
 * Everything here is built out of `components/ui` primitives and `constants/tokens`
 * — the module has its own screens, not its own design system. A dish card and a
 * listing card are different objects; a dish card and a listing card that use
 * different greens are a bug.
 */

export { DietMark, FoodPhoto, RatingPill, VegOnlyToggle, type FoodPhotoProps } from './FoodMarks';
export { AddControl, type AddControlProps } from './AddControl';
export { KitchenCard, type KitchenCardProps } from './KitchenCard';
export { DishRow, DishTile, type DishRowProps } from './DishRow';
export {
  FavouriteHeart,
  FavouritesUnavailableNote,
  type FavouriteHeartProps,
} from './FavouriteHeart';
export { FulfilmentToggle, RoomTargetRow, type FulfilmentToggleProps } from './Fulfilment';
export { DockedCartBar, type DockedCartBarProps } from './DockedCartBar';
export { BillBreakdown, ReceiptLine, type BillLine, type BillBreakdownProps } from './BillBreakdown';
export { ActiveOrderCard, FoodStatusChip, FoodTimeline, timelineIndex } from './FoodStatus';
export { FoodNotice, FoodSectionHeader, OfferStrip, type FoodNoticeTone } from './FoodNotices';
export { FoodEmptyState, FoodFeedSkeleton, FoodMenuSkeleton, type FoodEmptyStateProps } from './FoodStates';
export { CartSwitchSheet, type CartSwitchSheetProps } from './CartSwitchSheet';
export { VegModeSheet, type VegModeSheetProps } from './VegModeSheet';
export { VegModeTransition, type VegModeTransitionProps } from './VegModeTransition';
export { VegModeButton, type VegModeButtonProps } from './VegModeButton';
export {
  DeliveryMap,
  metresBetween,
  readableDistance,
  type DeliveryMapProps,
  type LngLat,
} from './DeliveryMap';

export {
  PromoBanner,
  PROMO_ASPECT,
  type PromoBannerProps,
  type PromoSlide,
  type SlideHeadline,
  type SlideRider,
  type SlideSteam,
} from './PromoBanner';
export { CuisineRail, type CuisineRailProps } from './CuisineRail';
export { CuisineSheet, type CuisineSheetProps } from './CuisineSheet';
export { RestaurantListCard, type RestaurantListCardProps } from './RestaurantListCard';

export { FoodHome } from './FoodHome';
export { FoodSearch, SUGGESTIONS } from './FoodSearch';
export { FoodOrders } from './FoodOrders';
export { FoodModule } from './FoodModule';
export { FoodComingSoon } from './FoodComingSoon';

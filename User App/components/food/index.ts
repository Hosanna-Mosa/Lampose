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
/* `Fulfilment.tsx` exported a Deliver / Pick up toggle and the room-target row
   that went with it. Pickup is no longer offered — the order endpoint refuses
   one — and nothing in this app ever rendered either: see the note in
   `FoodDineIn.tsx`. The file is deleted rather than left as a control nobody
   may use. */
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
export { buildPromoSlides } from './promoSlides';
/** The Food advert shown while a stay request is with the owner. */
export { FoodWaitPromo } from './FoodWaitPromo';
export { CuisineRail, type CuisineRailProps } from './CuisineRail';
export { CuisineSheet, type CuisineSheetProps } from './CuisineSheet';
export { RestaurantListCard, type RestaurantListCardProps } from './RestaurantListCard';

export { FoodHome } from './FoodHome';
export { FoodSearch, SUGGESTIONS } from './FoodSearch';
export { FoodOrders } from './FoodOrders';
/* Dine In — kitchens open now, nearest first. Not a filtered Home; see its
   own doc comment for the errand it serves and where it deliberately
   stops short of claiming a table. */
export { FoodDineIn } from './FoodDineIn';
export { FoodModule } from './FoodModule';
export { FoodComingSoon } from './FoodComingSoon';

/**
 * The Food module.
 *
 * Everything here is built out of `components/ui` primitives and `constants/tokens`
 * — the module has its own screens, not its own design system. A dish card and a
 * listing card are different objects; a dish card and a listing card that use
 * different greens are a bug.
 *
 * The one thing Food adds to the vocabulary is the meal window, and it earns
 * that: nothing in the stay side of the app expires at 3:30 pm.
 */

export { DietMark, FoodPhoto, RatingPill, VegOnlyToggle, type FoodPhotoProps } from './FoodMarks';
export { MealWindowRail, MealWindowToken, WindowStatusLine } from './MealWindowRail';
export { AddControl, type AddControlProps } from './AddControl';
export { KitchenCard, type KitchenCardProps } from './KitchenCard';
export { DishRow, DishTile, type DishRowProps } from './DishRow';
export { FulfilmentToggle, RoomTargetRow, type FulfilmentToggleProps } from './Fulfilment';
export { DockedCartBar, type DockedCartBarProps } from './DockedCartBar';
export { BillBreakdown, ReceiptLine, type BillLine, type BillBreakdownProps } from './BillBreakdown';
export { ActiveOrderCard, FoodStatusChip, FoodTimeline, timelineIndex } from './FoodStatus';
export { SlotPicker, slotsFor, type Slot, type SlotPickerProps } from './SlotPicker';
export { FoodNotice, FoodSectionHeader, OfferStrip, type FoodNoticeTone } from './FoodNotices';
export { FoodEmptyState, FoodFeedSkeleton, FoodMenuSkeleton, type FoodEmptyStateProps } from './FoodStates';
export { CartSwitchSheet, type CartSwitchSheetProps } from './CartSwitchSheet';

export { FoodHome } from './FoodHome';
export { FoodSearch } from './FoodSearch';
export { FoodOrders } from './FoodOrders';
export { FoodModule } from './FoodModule';
export { FoodComingSoon } from './FoodComingSoon';

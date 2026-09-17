/**
 * Everything used by two or more screens, or by navigation, layout or lib.
 *
 * §4: common/ is the shared half of the kit -- one folder per component,
 * grouped by layer. This barrel is how the rest of the app asks for one.
 */

/* atoms */
export * from './atoms/Avatar';
export * from './atoms/Badge';
export * from './atoms/BareInput';
export * from './atoms/BookingStatusBadge';
export * from './atoms/Box';
export * from './atoms/Button';
export * from './atoms/Card';
export * from './atoms/Checkbox';
export * from './atoms/Chip';
export * from './atoms/ChipRow';
export * from './atoms/Divider';
export * from './atoms/Hatch';
export * from './atoms/Icon';
export * from './atoms/IconButton';
export * from './atoms/Input';
export * from './atoms/PaymentStatusBadge';
export * from './atoms/PayoutStatusBadge';
export * from './atoms/Picture';
export * from './atoms/Refresher';
export * from './atoms/Scroller';
export * from './atoms/Skeleton';
export * from './atoms/SkeletonCard';
export * from './atoms/Spinner';
export * from './atoms/StarRow';
export * from './atoms/Switch';
export * from './atoms/Tappable';
export * from './atoms/Text';
export * from './atoms/TextButton';

/* molecules */
export * from './molecules/CountdownChip';
export * from './molecules/DetailRow';
export * from './molecules/FieldBox';
export * from './molecules/FieldError';
export * from './molecules/FieldLabel';
export * from './molecules/HeaderPill';
export * from './molecules/OTPInput';
export * from './molecules/PhoneField';
export * from './molecules/Segmented';
export * from './molecules/Select';
export * from './molecules/VerificationCodeField';

/* organisms */
export * from './organisms/AadharUploadTile';
export * from './organisms/AlertProvider';
export * from './organisms/BottomSheet';
export * from './organisms/EmptyState';
export * from './organisms/ErrorState';
export * from './organisms/EvidenceGrid';
export * from './organisms/RequestCard';
export * from './organisms/Toast';

/* templates */
export * from './templates/Screen';
export * from './templates/TopHeader';

/*
 * Types the OLD kit exported publicly, which therefore have to keep coming
 * through. The list comes from the old components/ui/index.ts, NOT from the
 * internal files: those had export forced onto every private helper when they
 * were generated, so re-exporting all of them published two different private
 * Props aliases and collided.
 */
export type { BadgeSize, BookingStatus, PaymentStatus, PayoutState } from './utils/Badge.internal';

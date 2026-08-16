/**
 * The LAMPOSE design-system primitives.
 *
 * Screens import from here rather than from React Native directly, so that a
 * change to the system reaches every screen at once. Everything in this folder
 * is driven by tokens — no hardcoded colour, size, radius or type value.
 */

// Typography
export { Text, type TextColor, type TextProps } from './Text';

// Icons
export { Icon, type IconName, type IconProps, type IconSize } from './Icon';

// Actions
export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
} from './Button';

// Inputs
export { TextField, SearchField, type TextFieldProps, type SearchFieldProps } from './TextField';
export { OtpInput, type OtpInputProps, type OtpState } from './OtpInput';

// Money — locked contract, shared by card, detail and CTA bar
export { RentDisplay, type RentDisplayProps, type RentSize } from './RentDisplay';

// Selection
export {
  Checkbox,
  Radio,
  Switch,
  Chip,
  SegmentedControl,
  Stepper,
  type CheckboxProps,
  type RadioProps,
  type SwitchProps,
  type ChipProps,
  type SegmentedControlProps,
  type StepperProps,
} from './Selection';
export { CeilingFilter, CeilingSlider, type CeilingFilterProps, type CeilingSliderProps } from './CeilingFilter';

// Feedback
export {
  Toast,
  Snackbar,
  InlineAlert,
  OfflineBanner,
  type Tone,
  type ToastProps,
  type SnackbarProps,
  type InlineAlertProps,
  type OfflineBannerProps,
} from './Feedback';

// Loading
export {
  Spinner,
  ProgressBar,
  Skeleton,
  SkeletonCard,
  CountdownRing,
  type SpinnerProps,
  type ProgressBarProps,
  type SkeletonProps,
  type CountdownRingProps,
} from './Loading';

// Display
export {
  Badge,
  Avatar,
  Divider,
  Card,
  Tooltip,
  type BadgeProps,
  type AvatarProps,
  type DividerProps,
  type CardProps,
  type TooltipProps,
} from './Display';

// Overlays
export {
  BottomSheet,
  ConfirmModal,
  Dialog,
  type BottomSheetProps,
  type ConfirmModalProps,
  type DialogProps,
} from './Overlay';

import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * `success` and `dangerOutline` exist because accepting and rejecting a booking
 * are colour-coded in the designs rather than using the accent — the two most
 * consequential buttons in the app sit side by side and must not look alike.
 */
type Variant = 'primary' | 'secondary' | 'destructive' | 'dangerOutline' | 'success' | 'ghost';
type Size = 'lg' | 'sm';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks presses. The label is yours to swap ("Verifying…"). */
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
  testID,
}: Props) {
  const c = useColors();
  const inert = disabled || loading;
  const height = size === 'lg' ? 52 : 40;

  // Disabled outranks variant: the design system draws one flat disabled treatment.
  const skins: Record<Variant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.accent, fg: c.white, border: 'transparent' },
    secondary: { bg: c.surface, fg: c.textPrimary, border: c.border },
    destructive: { bg: c.error, fg: c.white, border: 'transparent' },
    dangerOutline: { bg: c.surface, fg: c.error, border: c.error },
    success: { bg: c.success, fg: c.white, border: 'transparent' },
    ghost: { bg: 'transparent', fg: c.accent, border: 'transparent' },
  };

  const skin =
    disabled && !loading
      ? { bg: c.borderSubtle, fg: c.textTertiary, border: 'transparent' }
      : skins[variant];

  const outlined = variant === 'secondary' || variant === 'dangerOutline';

  return (
    <Pressable
      testID={testID}
      onPress={inert ? undefined : onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy: loading }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          borderRadius: size === 'lg' ? radius.control : radius.md,
          backgroundColor: skin.bg,
          borderColor: skin.border,
          borderWidth: outlined && !disabled ? 1.5 : 0,
          paddingHorizontal: size === 'lg' ? 24 : 18,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: pressed && !inert ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={skin.fg} /> : null}
      {icon && !loading ? <Icon name={icon} size={size === 'lg' ? 18 : 16} color={skin.fg} strokeWidth={2} /> : null}
      <Text
        style={{
          fontFamily: fonts.semibold,
          fontSize: size === 'lg' ? 15 : 13,
          lineHeight: size === 'lg' ? 20 : 18,
          color: skin.fg,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Standalone text action — "Resend code", "+ Add rule", "Mark all read".
 * Padded to the 44px minimum touch target even though it reads as plain text.
 */
export function TextButton({
  label,
  onPress,
  color,
  disabled,
  testID,
}: {
  label: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  testID?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      testID={testID}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={({ pressed }) => [styles.textButton, { opacity: pressed ? 0.6 : disabled ? 0.5 : 1 }]}
    >
      <Text variant="link" style={{ color: color ?? c.accent }}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Icon-only control. The designs draw several of these at 16px with no padding
 * (the pricing row's edit and delete); this always claims a 44px target.
 */
export function IconButton({
  name,
  onPress,
  color,
  size = 20,
  label,
  testID,
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  size?: number;
  label: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

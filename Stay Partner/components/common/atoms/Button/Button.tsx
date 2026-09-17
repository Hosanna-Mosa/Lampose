import { ActivityIndicator, Pressable } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { Icon } from '@/components/common/atoms/Icon';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { Variant, Props, styles } from '@/components/common/utils/Button.internal';

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

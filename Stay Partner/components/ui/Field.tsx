import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Shared field chrome. Input and PhoneField both build on these so the two can't
 * drift — the source designs already carry 48px, 50px and 52px versions of what
 * should be one control.
 */

export function FieldLabel({
  children,
  optional,
  muted,
}: {
  children: ReactNode;
  optional?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.labelRow}>
      <Text variant="label" color={muted ? 'textTertiary' : 'textPrimary'}>
        {children}
      </Text>
      {optional ? (
        <Text variant="badge" color="textTertiary">
          Optional
        </Text>
      ) : null}
    </View>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.errorRow}>
      <Icon name="alert-circle" size={13} color={c.error} strokeWidth={2.5} />
      <Text variant="badge" color="error" style={styles.errorText}>
        {children}
      </Text>
    </View>
  );
}

/**
 * The bordered box, plus a focus ring drawn as a transparent-by-default outer
 * border so gaining focus never shifts layout.
 */
export function FieldBox({
  children,
  focused,
  invalid,
  disabled,
  height = 52,
  align = 'center',
  style,
}: {
  children: ReactNode;
  focused?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  height?: number;
  align?: 'center' | 'flex-start';
  style?: ViewStyle;
}) {
  const c = useColors();

  const borderColor = invalid ? c.error : focused ? c.accent : disabled ? c.borderSubtle : c.border;
  const ringColor = focused && !invalid ? c.accentTint : 'transparent';

  return (
    <View style={[styles.ring, { borderColor: ringColor }, style]}>
      <View
        style={[
          styles.box,
          {
            borderColor,
            backgroundColor: disabled ? c.surfaceSunken : c.surface,
            minHeight: height,
            alignItems: align,
            paddingVertical: align === 'flex-start' ? 14 : 0,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ring: {
    borderWidth: 3,
    borderRadius: radius.control + 3,
  },
  box: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: 16,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  errorText: {
    flex: 1,
  },
});

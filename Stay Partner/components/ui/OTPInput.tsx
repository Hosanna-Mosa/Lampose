import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from './Text';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

type Props = {
  value: string;
  onChangeText: (digits: string) => void;
  /** 6 for login, 4 for the check-in code. */
  length?: number;
  /** `lg` is the check-in code: fixed 54x60 cells, centred rather than filling the row. */
  size?: 'md' | 'lg';
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  /** False for a PIN code or anything else that isn't an SMS one-time code — skips the SMS-autofill hints, which would otherwise suggest the wrong thing. */
  otp?: boolean;
};

/**
 * Boxed code entry.
 *
 * One offscreen TextInput backs the whole code rather than one input per box —
 * that keeps backspace, paste and SMS autofill working (`oneTimeCode` on iOS,
 * `sms-otp` on Android), which per-box inputs reliably break.
 */
export function OTPInput({
  value,
  onChangeText,
  length = 6,
  size = 'md',
  invalid,
  disabled,
  autoFocus,
  accessibilityLabel = `${length}-digit code`,
  otp = true,
}: Props) {
  const c = useColors();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const cells = Array.from({ length }, (_, i) => i);
  const big = size === 'lg';
  const cell = big
    ? { width: 54, height: 60, font: 22, gap: 10 }
    : { width: undefined, height: 52, font: 19, gap: 8 };
  const caret = Math.min(value.length, length - 1);

  return (
    <Pressable
      onPress={() => input.current?.focus()}
      disabled={disabled}
      accessibilityRole="none"
      style={[
        styles.row,
        { gap: cell.gap, justifyContent: big ? 'center' : 'flex-start' },
        disabled ? styles.disabled : null,
      ]}
    >
      {cells.map((i) => {
        const digit = value[i];
        const isCaret = focused && !disabled && !invalid && i === caret && value.length < length;

        const borderColor = invalid
          ? c.error
          : disabled
            ? c.borderSubtle
            : isCaret
              ? c.accent
              : digit
                ? c.border
                : c.borderSubtle;

        return (
          <View
            key={i}
            style={[
              styles.ring,
              big ? null : styles.ringFlex,
              { borderColor: isCaret ? c.accentTint : 'transparent' },
            ]}
          >
            <View
              style={[
                styles.cell,
                {
                  borderColor,
                  backgroundColor: disabled ? c.surfaceSunken : c.surface,
                  width: cell.width,
                  height: cell.height,
                },
              ]}
            >
              <Text
                style={[
                  styles.digit,
                  { color: invalid ? c.error : disabled ? c.textTertiary : c.textPrimary, fontSize: cell.font, lineHeight: cell.font + 6 },
                ]}
              >
                {digit ?? ''}
              </Text>
            </View>
          </View>
        );
      })}

      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, length))}
        editable={!disabled}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType={otp ? 'oneTimeCode' : undefined}
        autoComplete={otp ? 'sms-otp' : 'off'}
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={accessibilityLabel}
        style={styles.hidden}
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  disabled: {
    opacity: 0.6,
  },
  ring: {
    borderWidth: 3,
    borderRadius: radius.control + 3,
  },
  ringFlex: { flex: 1 },
  cell: {
    borderWidth: 1.5,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontFamily: fonts.bold,
    fontSize: 19,
    lineHeight: 24,
  },
  hidden: {
    position: 'absolute',
    opacity: 0,
    height: 52,
    width: '100%',
  },
});

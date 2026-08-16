import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './Text';
import { FieldBox, FieldError, FieldLabel } from './Field';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/** Formats 10 raw digits as the design shows them: "98765 43210". */
export function formatPhone(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

export const PHONE_LENGTH = 10;

type Props = {
  label?: string;
  /** Raw digits, no spaces. */
  value: string;
  onChangeText: (digits: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  countryCode?: string;
  /** Opens a country picker. No picker is designed yet — see the note in the pill below. */
  onPressCountry?: () => void;
};

/**
 * Country pill plus number field, sharing the 52px height and 10px radius of
 * every other input.
 */
export function PhoneField({
  label = 'Mobile number',
  value,
  onChangeText,
  onBlur,
  error,
  disabled,
  autoFocus,
  countryCode = '+91',
  onPressCountry,
}: Props) {
  const c = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <View>
      {label ? <FieldLabel muted={disabled}>{label}</FieldLabel> : null}

      <View style={[styles.row, disabled ? styles.rowDisabled : null]}>
        {/*
          The design draws a chevron here, implying a country picker — but no
          picker exists anywhere in the design set, and the app is India-only
          (₹, IFSC, Aadhaar). Left inert rather than invented.
        */}
        <Pressable
          onPress={onPressCountry}
          disabled={!onPressCountry || disabled}
          accessibilityRole="button"
          accessibilityLabel={`Country code ${countryCode}`}
          style={[
            styles.country,
            {
              borderColor: disabled ? c.borderSubtle : c.border,
              backgroundColor: disabled ? c.surfaceSunken : c.surface,
            },
          ]}
        >
          <Text
            style={[styles.countryText, { color: disabled ? c.textTertiary : c.textPrimary }]}
          >
            {countryCode}
          </Text>
          {disabled ? null : (
            <Svg width={8} height={6} viewBox="0 0 8 6">
              <Path
                d="M1 1l3 3 3-3"
                stroke={c.textSecondary}
                strokeWidth={1.4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          )}
        </Pressable>

        <FieldBox
          focused={focused}
          invalid={Boolean(error)}
          disabled={disabled}
          style={styles.number}
        >
          <TextInput
            value={formatPhone(value)}
            onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, PHONE_LENGTH))}
            editable={!disabled}
            autoFocus={autoFocus}
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={PHONE_LENGTH + 1} // one space
            placeholder="98765 43210"
            placeholderTextColor={c.textTertiary}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              onBlur?.();
            }}
            accessibilityLabel={label}
            style={[styles.input, { color: disabled ? c.textTertiary : c.textPrimary }]}
          />
        </FieldBox>
      </View>

      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rowDisabled: {
    opacity: 0.6,
  },
  country: {
    width: 76,
    height: 52,
    marginTop: 3, // aligns with the number field inside its focus ring
    borderWidth: 1.5,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  countryText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  number: {
    flex: 1,
  },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    padding: 0,
  },
});

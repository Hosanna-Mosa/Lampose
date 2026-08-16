import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { FieldBox, FieldError, FieldLabel } from './Field';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

type Props = Omit<TextInputProps, 'style' | 'editable'> & {
  label?: string;
  /** Renders "Optional" against the label, as the designs do. */
  optional?: boolean;
  /** Inline message below the field. Turns the border red. */
  error?: string;
  /** Non-editable, greyed — e.g. a bank name derived from the IFSC. */
  disabled?: boolean;
  /** Fixed leading text inside the field, e.g. the rupee sign. */
  prefix?: string;
  multiline?: boolean;
  /** Multiline height. Ignored for single-line fields. */
  minHeight?: number;
  containerStyle?: ViewStyle;
};

export function Input({
  label,
  optional,
  error,
  disabled,
  prefix,
  multiline,
  minHeight = 96,
  containerStyle,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const c = useColors();
  const [focused, setFocused] = useState(false);

  return (
    <View style={containerStyle}>
      {label ? (
        <FieldLabel optional={optional} muted={disabled}>
          {label}
        </FieldLabel>
      ) : null}

      <FieldBox
        focused={focused}
        invalid={Boolean(error)}
        disabled={disabled}
        height={multiline ? minHeight : 52}
        align={multiline ? 'flex-start' : 'center'}
      >
        {prefix ? (
          <Text variant="body" color={disabled ? 'textDisabled' : 'textPrimary'}>
            {prefix}{' '}
          </Text>
        ) : null}
        <TextInput
          {...rest}
          editable={!disabled}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={c.textTertiary}
          style={[
            styles.input,
            {
              color: disabled ? c.textDisabled : c.textPrimary,
              textAlignVertical: multiline ? 'top' : 'center',
            },
          ]}
        />
      </FieldBox>

      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    padding: 0,
  },
});

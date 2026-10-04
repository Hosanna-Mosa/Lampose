import React from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { MAX_FONT_SCALE, font, line, ms, radius, size, ui } from "@/theme/ui";
import { Txt } from "./Txt";

interface FieldProps {
  label?: string;
  /** Marks the label — a red asterisk, or a muted "Optional". */
  required?: boolean;
  optional?: boolean;
  /** Muted guidance under the control. Replaced by `error` when there is one. */
  hint?: string;
  error?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A label above any control (chips, a segmented pill, a photo) and a hint below it. */
export function Field({ label, required, optional, hint, error, children, style }: FieldProps) {
  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <View style={styles.labelRow}>
          <Txt style={styles.label}>
            {label}
            {required ? <Txt style={styles.required}> *</Txt> : null}
          </Txt>
          {optional ? <Txt style={styles.optional}>Optional</Txt> : null}
        </View>
      ) : null}
      {children}
      {error ? <Txt style={styles.error}>{error}</Txt> : hint ? <Txt style={styles.hint}>{hint}</Txt> : null}
    </View>
  );
}

interface Props extends Omit<TextInputProps, "style"> {
  label?: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  /** Leading element, e.g. a search icon. */
  icon?: React.ReactNode;
  /** Text before the value, e.g. "₹". */
  prefix?: string;
  /** Trailing element, e.g. a unit or a clear button. */
  right?: React.ReactNode;
  /** Grows with its content from this height instead of staying one line. */
  multilineHeight?: number;
  /** Style of the outer wrapper (label + field + hint). */
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
}

/** Text input with a focus border, a label, and an inline hint or error. */
export function TextField({
  label,
  required,
  optional,
  hint,
  error,
  icon,
  prefix,
  right,
  multilineHeight,
  containerStyle,
  style,
  onFocus,
  onBlur,
  editable = true,
  autoCorrect = false,
  multiline,
  ...rest
}: Props) {
  const [focused, setFocused] = React.useState(false);
  const tall = multilineHeight ?? (multiline ? 96 : undefined);

  return (
    <Field label={label} required={required} optional={optional} hint={hint} error={error} style={containerStyle}>
      <View
        style={[
          styles.field,
          tall ? { height: undefined, minHeight: tall, alignItems: "flex-start", paddingVertical: 12 } : null,
          {
            borderColor: focused ? ui.brand : error ? ui.errorSolid : ui.border,
            borderWidth: focused ? 2 : 1,
            backgroundColor: editable ? ui.surface : ui.sunken,
          },
        ]}
      >
        {icon}
        {prefix ? <Txt style={styles.prefix}>{prefix}</Txt> : null}
        <TextInput
          {...rest}
          multiline={multiline}
          editable={editable}
          autoCorrect={autoCorrect}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          placeholderTextColor={ui.muted}
          textAlignVertical={tall ? "top" : "center"}
          style={[styles.input, tall ? { minHeight: tall - 24 } : null, !editable && { color: ui.sec }, style]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {right}
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  label: { flexShrink: 1, fontFamily: font.body.medium, fontSize: size.medium, color: ui.sec },
  required: { color: ui.errorSolid },
  optional: { fontFamily: font.body.medium, fontSize: size.small, color: ui.muted },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: ms(14),
    height: ms(50),
  },
  prefix: { fontFamily: font.body.bold, fontSize: size.medium, color: ui.muted },
  input: {
    flex: 1,
    fontFamily: font.body.regular,
    fontSize: size.medium,
    color: ui.text,
    paddingVertical: 0,
  },
  hint: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.muted },
  error: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.error },
});

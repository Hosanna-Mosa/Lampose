import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { Icon } from './Icon';
import { Text } from './Text';
import { typeScale, resolveFontFamily } from '@/constants/tokens';
import { useTheme } from '@/context/ThemeContext';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'maxLength'> & {
  label: string;
  /** Sits under the field at rest. Replaced by `error` when there is one. */
  helper?: string;
  /** Present means the field is in its error state. Say how to fix it. */
  error?: string;
  /** A fixed, non-editable prefix such as the +91 dial code. */
  prefix?: string;
  maxLength?: number;
  /** Show a live count. Only meaningful with `maxLength`. */
  showCount?: boolean;
  multiline?: boolean;
  disabled?: boolean;
  /** Renders as read-only with an explanation rather than a dead grey box. */
  readOnly?: boolean;
  optional?: boolean;
  containerStyle?: ViewStyle;
};

/**
 * The standard field. Radius is `chip` (8) — the pill radius is reserved for
 * search, so shape alone tells a user which field queries and which records.
 *
 * The error state is never carried by colour alone: it gains a glyph and a
 * sentence that says what to do, not what went wrong.
 */
export function TextField({
  label,
  helper,
  error,
  prefix,
  maxLength,
  showCount = false,
  multiline = false,
  disabled = false,
  readOnly = false,
  optional = false,
  containerStyle,
  value,
  ...rest
}: TextFieldProps) {
  const { colors, space, radius, touch } = useTheme();
  const [focused, setFocused] = useState(false);

  const inert = disabled || readOnly;
  const hasError = Boolean(error);
  const count = value?.length ?? 0;

  const borderColor = hasError
    ? colors.danger.base
    : focused
      ? colors.brand
      : inert
        ? colors.borderSubtle
        // An empty field's edge is its whole affordance — see `borderInput`.
        : colors.borderInput;

  return (
    <View style={[{ gap: space[2] }, containerStyle]}>
      <View style={styles.labelRow}>
        {/*
          `label`, not `bodyStrong` — small, uppercase and tracked, which is how
          the Dock reference sets every field label on its sign-in screen.

          It is a hierarchy fix as much as a stylistic one. A field label set in
          the same face, size and weight as the body copy around it competes
          with that copy, and this screen has four labels, four helper lines and
          a paragraph of legal text: at `bodyStrong` the labels were the
          loudest thing on it, above even the heading. Uppercase at 10pt with
          1pt of tracking reads unmistakably as a NAME FOR THE FIELD BELOW
          rather than as something to read, which is the job.

          10pt is the floor of the scale and it is only defensible because the
          label is never the only thing identifying a field — the placeholder,
          the helper line under it and the accessible name all carry it too.
        */}
        <Text variant="label" color={inert ? 'tertiary' : 'secondary'}>
          {label}
        </Text>
        {optional ? (
          <Text variant="caption" color="tertiary">
            optional
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.field,
          {
            minHeight: multiline ? 96 : touch.min + 4,
            borderRadius: radius.chip,
            borderColor,
            borderWidth: focused || hasError ? 1.5 : 1,
            backgroundColor: inert ? colors.surfaceSunken : colors.surface,
            paddingHorizontal: space[3],
            paddingVertical: multiline ? space[3] : 0,
            alignItems: multiline ? 'flex-start' : 'center',
            gap: space[2],
          },
        ]}
      >
        {prefix ? (
          <>
            <Text variant="priceSm" color={inert ? 'tertiary' : 'secondary'}>
              {prefix}
            </Text>
            <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: space[2], backgroundColor: colors.border }} />
          </>
        ) : null}

        <TextInput
          value={value}
          editable={!inert}
          multiline={multiline}
          maxLength={maxLength}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.brand}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            {
              color: inert ? colors.textSecondary : colors.textPrimary,
              fontFamily: resolveFontFamily('body', 400),
              // From the scale, not a literal. TextInput cannot be wrapped in
              // <Text>, so it is the one place that has to read the token by
              // hand — and it was the one place a scale change silently missed,
              // leaving a field's label smaller than the text typed into it.
              fontSize: typeScale.bodyLg.size,
              paddingVertical: multiline ? 0 : space[3],
              textAlignVertical: multiline ? 'top' : 'center',
            },
          ]}
          {...rest}
        />
      </View>

      <View style={styles.footerRow}>
        <View style={[styles.footerMessage, { gap: space[1] }]}>
          {hasError ? <Icon name="alert" size={16} color={colors.danger.ink} /> : null}
          {error || helper ? (
            <Text variant="caption" color={hasError ? 'danger' : 'secondary'} style={styles.flex}>
              {error ?? helper}
            </Text>
          ) : null}
        </View>
        {showCount && maxLength ? (
          <Text variant="numMeta" color={count >= maxLength ? 'warning' : 'tertiary'}>
            {count}/{maxLength}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export type SearchFieldProps = Omit<TextInputProps, 'style'> & {
  onClear?: () => void;
  containerStyle?: ViewStyle;
};

/**
 * Search, and only search, gets `radius.button`. Every other field is r8, so
 * the shape is still doing some labelling before a single word is read — but
 * it is a rounded rect rather than the full pill it used to be.
 *
 * The pill came from a system where shape was the ONLY thing separating search
 * from a text input. The Dock reference draws both of its search fields as
 * rounded rects and leaves the labelling to the magnifier inside them, which is
 * the stronger signal anyway: a glyph says "search" to somebody who has never
 * used the app, and a corner radius does not.
 *
 * The pill also read badly next to everything around it once the palette went
 * warm. It sits directly above a row of pill-shaped filter CHIPS, which are
 * controls of a completely different kind, and a full-round 52pt field over a
 * line of full-round 40pt chips reads as one family of five things rather than
 * one field and four filters.
 */
export function SearchField({ value, onClear, containerStyle, ...rest }: SearchFieldProps) {
  const { colors, space, radius, touch } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.field,
        {
          minHeight: touch.min + 4,
          borderRadius: radius.button,
          borderWidth: focused ? 1.5 : 1,
          borderColor: focused ? colors.brand : colors.borderInput,
          backgroundColor: colors.surface,
          paddingHorizontal: space[4],
          alignItems: 'center',
          gap: space[2],
        },
        containerStyle,
      ]}
    >
      <Icon name="search" size={20} color={focused ? colors.brandInk : colors.textTertiary} />
      <TextInput
        value={value}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.brand}
        returnKeyType="search"
        numberOfLines={1}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          {
            color: colors.textPrimary,
            fontFamily: resolveFontFamily('body', 400),
            fontSize: typeScale.body.size,
            paddingVertical: space[2],
          },
        ]}
        {...rest}
      />
      {value ? (
        <Pressable
          onPress={onClear}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Icon name="close" size={20} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  field: { flexDirection: 'row', borderStyle: 'solid' },
  input: { flex: 1, padding: 0, margin: 0 },
  footerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  footerMessage: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  flex: { flex: 1 },
});

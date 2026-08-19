import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './Text';
import { Icon } from './Icon';
import { FieldLabel } from './Field';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Select field that expands its options inline rather than opening a picker.
 *
 * No picker screen exists anywhere in the design set, and pushing a route for
 * four options would be heavier than the choice deserves. Expanding in place
 * keeps the whole decision on one surface — which matters inside a sheet.
 */
export function Select<T extends string>({
  label,
  optional,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled,
  format,
}: {
  label?: string;
  optional?: boolean;
  options: readonly T[];
  value: T | null;
  onChange: (next: T) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * How to word an option, when the stored value is not what to show.
   *
   * Added for the category picker, whose values are codes — `PG_HOSTEL` is
   * what goes in the column and "PG / Hostel" is what an owner reads. Optional,
   * so every other Select, whose values are already words, is unchanged.
   */
  format?: (option: T) => string;
}) {

  const show = (option: T) => (format ? format(option) : option);
  const c = useColors();
  const [open, setOpen] = useState(false);

  return (
    <View>
      {label ? (
        <FieldLabel optional={optional} muted={disabled}>
          {label}
        </FieldLabel>
      ) : null}

      <Pressable
        onPress={() => setOpen((o) => !o)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        accessibilityLabel={`${label ?? 'Select'}. ${value ? show(value) : placeholder}`}
        style={({ pressed }) => [
          styles.field,
          {
            borderColor: open ? c.accent : c.border,
            backgroundColor: disabled ? c.surfaceSunken : c.surface,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Text
          variant="bodySm"
          color={value ? 'textPrimary' : 'textTertiary'}
          style={styles.value}
          numberOfLines={1}
        >
          {value ? show(value) : placeholder}
        </Text>
        <View style={open ? styles.chevronOpen : undefined}>
          <Svg width={9} height={6} viewBox="0 0 8 6">
            <Path
              d="M1 1l3 3 3-3"
              stroke={c.textSecondary}
              strokeWidth={1.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </Pressable>

      {open ? (
        <View style={[styles.options, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
          {options.map((o, i) => {
            const selected = o === value;
            return (
              <Pressable
                key={o}
                onPress={() => {
                  onChange(o);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.option,
                  i > 0 ? { borderTopWidth: 1, borderTopColor: c.borderSubtle } : null,
                  { backgroundColor: pressed ? c.surfaceSunken : 'transparent' },
                ]}
              >
                <Text variant="bodySm" color={selected ? 'accent' : 'textPrimary'}>
                  {show(o)}
                </Text>
                {selected ? <Icon name="check" size={14} color={c.accent} strokeWidth={2.5} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 48,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  value: { flex: 1, fontFamily: fonts.regular },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  options: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: radius.control,
    overflow: 'hidden',
  },
  option: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
});

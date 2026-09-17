import { useRef, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/components/common/atoms/Text';
import { Icon } from '@/components/common/atoms/Icon';
import { FieldLabel } from '@/components/common/molecules/FieldLabel';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Select field that expands its options inline rather than opening a picker.
 *
 * No picker screen exists anywhere in the design set, and pushing a route for
 * four options would be heavier than the choice deserves. Expanding in place
 * keeps the whole decision on one surface — which matters inside a sheet.
 *
 * ## `overlay`, for a filter above a list
 *
 * Inline is right on a FORM: the fields below are the rest of the same
 * question, and moving them down a little to make room is honest. It is wrong
 * above a LIST. Opening the Bookings filter pushed every booking down the
 * screen — the rows an owner is looking at slid away from under their thumb
 * at the exact moment they were choosing how to narrow them.
 *
 * With `overlay`, the panel is drawn in a `Modal` positioned over the field it
 * belongs to, so nothing below it moves. A modal rather than an absolutely
 * positioned sibling because Android clips and refuses touches on children
 * drawn outside their parent's bounds — the same trap the User App's own
 * dropdown documents. The field is measured at open time, never cached: the
 * page scrolls between opens.
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
  overlay = false,
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
  /** Draw the options OVER what is below instead of pushing it down. */
  overlay?: boolean;
}) {

  const show = (option: T) => (format ? format(option) : option);
  const c = useColors();
  const [open, setOpen] = useState(false);

  /* Overlay mode only. Measured when the field is tapped rather than on
     layout: a position captured earlier is stale the moment the list behind
     it scrolls. */
  const fieldRef = useRef<View>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const toggle = () => {
    if (open) { setOpen(false); return; }
    if (!overlay) { setOpen(true); return; }
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  };

  /* Below the field, unless there is more room above it. */
  const below = windowHeight - (anchor.y + anchor.height) - 16;
  const above = anchor.y - 16;
  const dropUp = below < 220 && above > below;
  const panelMax = Math.max(160, Math.min(320, dropUp ? above : below));

  const list = (
    <>
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
    </>
  );

  return (
    <View>
      {label ? (
        <FieldLabel optional={optional} muted={disabled}>
          {label}
        </FieldLabel>
      ) : null}

      <Pressable
        ref={fieldRef}
        onPress={toggle}
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

      {/* Inline: the options take space and everything below shifts down. Right
          on a form, wrong above a list — see the note on `overlay`. */}
      {open && !overlay ? (
        <View style={[styles.options, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
          {list}
        </View>
      ) : null}

      {/* Overlay: drawn over the page at the field's measured position, so
          nothing below it moves. Tapping anywhere off the panel closes it. */}
      {overlay ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Close"
          />
          <View
            style={[
              styles.panel,
              {
                left: anchor.x,
                width: anchor.width,
                maxHeight: panelMax,
                borderColor: c.borderCard,
                backgroundColor: c.surface,
                shadowColor: c.textPrimary,
              },
              dropUp
                ? { bottom: windowHeight - anchor.y + 6 }
                : { top: anchor.y + anchor.height + 6 },
            ]}
          >
            <ScrollView bounces={false}>{list}</ScrollView>
          </View>
        </Modal>
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
  /* The overlay panel. Lifted, because it is over content rather than part
     of the column, and the shadow is what says so. */
  panel: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: radius.control,
    overflow: 'hidden',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
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

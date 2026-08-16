import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { radius, shadow } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Two-or-more-way switch between modes of one screen — price vs availability,
 * or an earnings period. Distinct from Chip, which filters a list rather than
 * changing what the screen is for.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  /** Display text per option, when the value isn't what you want shown. */
  labels?: Record<T, string>;
}) {
  const c = useColors();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.track, { backgroundColor: c.surfaceSunken }]}
    >
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(o)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segment,
              active ? [{ backgroundColor: c.surface }, shadow.card] : null,
              { opacity: pressed && !active ? 0.7 : 1 },
            ]}
          >
            <Text
              style={{
                fontFamily: active ? fonts.bold : fonts.semibold,
                fontSize: 13,
                lineHeight: 18,
                color: active ? c.textPrimary : c.textCaption,
              }}
            >
              {labels?.[o] ?? o}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.control,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
});

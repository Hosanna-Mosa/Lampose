import { Pressable, StyleSheet, View } from 'react-native';
import { Hatch } from './Hatch';
import { Icon } from './Icon';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Add/remove grid for photo evidence — the new-ticket form and the dispute
 * form both draw the same hatched-tile-plus-dashed-add pattern.
 *
 * Tiles genuinely add and remove. What they don't do is touch a camera or
 * photo library — that integration exists nowhere in this app, and there's no
 * way to test permission dialogs or picker behaviour in this environment, so
 * it isn't built here as though it were.
 */
export function EvidenceGrid({
  count,
  onChange,
  max = 6,
}: {
  count: number;
  onChange: (next: number) => void;
  max?: number;
}) {
  const c = useColors();

  return (
    <View style={styles.grid}>
      {Array.from({ length: count }, (_, i) => (
        <Pressable
          key={i}
          onPress={() => onChange(count - 1)}
          accessibilityRole="button"
          accessibilityLabel={`Remove attached photo ${i + 1}`}
          style={styles.tile}
        >
          <Hatch tone="neutral" radius={10} style={styles.tileFill} />
          <View style={[styles.removeBadge, { backgroundColor: c.error }]}>
            <Icon name="close" size={10} color={c.white} strokeWidth={3} />
          </View>
        </Pressable>
      ))}
      {count < max ? (
        <Pressable
          onPress={() => onChange(count + 1)}
          accessibilityRole="button"
          accessibilityLabel="Attach a photo"
          style={[styles.tile, styles.addTile, { borderColor: c.border }]}
        >
          <Icon name="plus" size={18} color={c.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: radius.chip,
  },
  tileFill: { flex: 1 },
  removeBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

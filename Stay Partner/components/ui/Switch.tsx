import { Pressable, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

const SIZES = {
  /** Notification toggles on Settings. */
  md: { width: 44, height: 26, knob: 20, pad: 3 },
  /** Per-capability permission toggles on Invite staff. */
  sm: { width: 40, height: 24, knob: 18, pad: 3 },
} as const;

/**
 * On/off pill toggle. A plain style swap, same as `Chip`/`Segmented` — no
 * animation library earns its keep for a single knob sliding 18–24px.
 *
 * The visible track can be smaller than 44px, so the pressable area is padded
 * out to the minimum touch target rather than stopping at the knob's edges.
 */
export function Switch({
  value,
  onChange,
  size = 'md',
  disabled,
  accessibilityLabel,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  size?: keyof typeof SIZES;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const dim = SIZES[size];

  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={10}
      style={[styles.hit, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View
        style={[
          styles.track,
          {
            width: dim.width,
            height: dim.height,
            borderRadius: dim.height / 2,
            padding: dim.pad,
            backgroundColor: value ? c.accent : c.surfaceSunken,
            alignItems: value ? 'flex-end' : 'flex-start',
          },
        ]}
      >
        <View
          style={[
            styles.knob,
            {
              width: dim.knob,
              height: dim.knob,
              borderRadius: dim.knob / 2,
              backgroundColor: c.white,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  track: { justifyContent: 'center' },
  knob: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
});

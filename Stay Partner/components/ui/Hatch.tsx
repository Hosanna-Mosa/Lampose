import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { radius as r } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Diagonal-hatch placeholder standing in for artwork that hasn't been produced —
 * the onboarding illustration, the location map, empty photo tiles. Mirrors the
 * `repeating-linear-gradient(135deg, …)` the design files use for the same job.
 */
export function Hatch({
  height,
  tone = 'accent',
  label,
  radius = r.card,
  style,
}: {
  height?: number;
  /** `accent` for feature artwork, `neutral` for photo and media slots. */
  tone?: 'accent' | 'neutral';
  /** Mono caption chip, centred — names what belongs here. */
  label?: string;
  radius?: number;
  style?: ViewStyle;
}) {
  const c = useColors();
  const [a, b] = tone === 'accent' ? [c.accentTint, c.accentTintAlt] : ['#F0EEEC', '#F7F6F5'];
  const id = `hatch-${tone}`;

  return (
    <View style={[styles.wrap, { height, borderRadius: radius }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          {/* 14px bands, rotated 45° — the SVG equivalent of the design's 135° gradient. */}
          <Pattern id={id} patternUnits="userSpaceOnUse" width={28} height={28} patternTransform="rotate(45)">
            <Rect x={0} y={0} width={14} height={28} fill={a} />
            <Rect x={14} y={0} width={14} height={28} fill={b} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>

      {label ? (
        <View style={styles.labelWrap} pointerEvents="none">
          <View style={[styles.chip, { backgroundColor: 'rgba(254, 253, 252, 0.85)' }]}>
            <Text variant="mono" style={{ color: tone === 'accent' ? c.accentHover : c.textCaption }}>
              {label}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    width: '100%',
  },
  labelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
});

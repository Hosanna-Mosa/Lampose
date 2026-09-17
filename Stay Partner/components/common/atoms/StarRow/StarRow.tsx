import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

const STAR_PATH =
  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z';

/**
 * One star, filled to an arbitrary fraction. The design only ever draws whole
 * stars (floor of the rating, remainder left as an outline), which makes 4.0
 * and 4.9 look identical — a fractional average earns a fractional fifth star,
 * clipped horizontally to its share.
 */
function Star({ size, fraction, color }: { size: number; fraction: number; color: string }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <Path d={STAR_PATH} fill="none" stroke={color} strokeWidth={1.5} />
      </Svg>
      {fraction > 0 ? (
        <View style={[StyleSheet.absoluteFill, { width: size * fraction, overflow: 'hidden' }]}>
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={STAR_PATH} fill={color} />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

export function StarRow({
  rating,
  size = 13,
  color,
  max = 5,
  style,
}: {
  rating: number;
  size?: number;
  color?: string;
  max?: number;
  style?: ViewStyle;
}) {
  const c = useColors();
  const starColor = color ?? c.warning;

  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: max }, (_, i) => (
        <Star key={i} size={size} fraction={Math.max(0, Math.min(1, rating - i))} color={starColor} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 1 },
});

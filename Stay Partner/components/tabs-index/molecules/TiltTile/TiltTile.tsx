import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/* How far a tile leans toward the finger, in degrees. */
const MAX_TILT = 12;
const SETTLE = { damping: 13, stiffness: 180, mass: 0.7 } as const;

type Props = {
  index: number;
  onPress: () => void;
  accessibilityLabel: string;
  style: ViewStyle;
  /** The icon disc — given its own 3D turn on touch. */
  icon: ReactNode;
  iconStyle: ViewStyle;
  /** Everything after the icon row. */
  children: ReactNode;
  trailing: ReactNode;
  headerStyle: ViewStyle;
};

/**
 * A Rent tile with depth.
 *
 * It swings in on its Y axis, one after another, when the tab first opens.
 * Pressed, it leans toward the finger — the corner touched dips away, like
 * pressing a real card — and springs back flat on release. The icon disc
 * turns once in 3D as it is touched. Reduced motion keeps only the press dim.
 */
export function TiltTile({
  index, onPress, accessibilityLabel, style, icon, iconStyle, children, trailing, headerStyle,
}: Props) {
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const press = useSharedValue(0);
  const turn = useSharedValue(0);
  const width = useSharedValue(1);
  const height = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    enter.value = withDelay(220 + index * 90, withSpring(1, { damping: 12, stiffness: 110, mass: 0.8 }));
  }, [reduceMotion, index, enter]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0, 0.5, 1], [0, 1, 1]),
    transform: [
      { perspective: 700 },
      { translateY: interpolate(enter.value, [0, 1], [30, 0]) },
      { rotateY: `${interpolate(enter.value, [0, 1], [index % 2 === 0 ? -55 : 55, 0]) + tiltY.value}deg` },
      { rotateX: `${tiltX.value}deg` },
      { scale: interpolate(press.value, [0, 1], [1, 0.965]) },
    ],
  }));

  const iconAnimated = useAnimatedStyle(() => ({
    transform: [
      { perspective: 400 },
      { rotateY: `${turn.value * 360}deg` },
      { scale: interpolate(press.value, [0, 1], [1, 1.08]) },
    ],
  }));

  return (
    <Animated.View style={[style, styles.reset, cardStyle]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onLayout={(e) => {
          width.value = Math.max(1, e.nativeEvent.layout.width);
          height.value = Math.max(1, e.nativeEvent.layout.height);
        }}
        onPressIn={(e) => {
          if (reduceMotion) {
            press.value = withTiming(1, { duration: 80 });
            return;
          }
          const { locationX, locationY } = e.nativeEvent;
          const dx = locationX / width.value - 0.5;
          const dy = locationY / height.value - 0.5;
          tiltY.value = withSpring(dx * 2 * MAX_TILT, SETTLE);
          tiltX.value = withSpring(-dy * 2 * MAX_TILT, SETTLE);
          press.value = withSpring(1, SETTLE);
          turn.value = 0;
          turn.value = withTiming(1, { duration: 650 });
        }}
        onPressOut={() => {
          tiltX.value = withSpring(0, SETTLE);
          tiltY.value = withSpring(0, SETTLE);
          press.value = withSpring(0, SETTLE);
        }}
        style={({ pressed }) => [styles.fill, pressed && reduceMotion ? { opacity: 0.9 } : null]}
      >
        <View style={headerStyle}>
          <Animated.View style={[iconStyle, iconAnimated]}>{icon}</Animated.View>
          {trailing}
        </View>
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* The card's own padding moves onto the Pressable, so the whole card —
     edges included — takes the touch and reports where it landed. */
  reset: { padding: 0 },
  fill: { flex: 1, padding: 14, justifyContent: 'space-between' },
});

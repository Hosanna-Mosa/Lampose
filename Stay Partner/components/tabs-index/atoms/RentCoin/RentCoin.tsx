import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const SIZE = 58;

/** One face of the coin: a gold disc with a raised ₹. */
function Face({ back }: { back?: boolean }) {
  return (
    <View style={[styles.face, back ? styles.back : null]}>
      <LinearGradient
        colors={['#FFF1A8', '#F5C542', '#C9971C']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.disc}
      >
        <View style={styles.rim}>
          <Text style={styles.symbol}>₹</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

/**
 * A gold rupee spinning in 3D over the Rent hero.
 *
 * A real Y-axis rotation under perspective, with two faces whose backs are
 * hidden — so the coin turns edge-on and shows its other side rather than
 * a mirrored ₹. It floats while it spins, and the shadow beneath it shrinks
 * as it rises. Still, with reduced motion.
 */
export function RentCoin() {
  const reduceMotion = useReducedMotion();
  const spin = useSharedValue(0);
  const float = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    /* A turn, then a breath — a coin that never stops reads as a loader. */
    spin.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
        withTiming(1, { duration: 1400 }),
      ),
      -1,
    );
    float.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduceMotion, spin, float]);

  const coinStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 600 },
      { translateY: interpolate(float.value, [0, 1], [0, -6]) },
      { rotateY: `${spin.value * 360}deg` },
      { rotateZ: '-8deg' },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(float.value, [0, 1], [0.35, 0.18]),
    transform: [{ scaleX: interpolate(float.value, [0, 1], [1, 0.75]) }],
  }));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.coin, coinStyle]}>
        <Face />
        <Face back />
      </Animated.View>
      <Animated.View style={[styles.shadow, shadowStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE + 8, alignItems: 'center' },
  coin: { width: SIZE, height: SIZE },
  face: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: 'hidden',
  },
  back: { transform: [{ rotateY: '180deg' }] },
  disc: {
    flex: 1,
    borderRadius: SIZE / 2,
    padding: 5,
    borderWidth: 1.5,
    borderColor: '#A87A10',
  },
  rim: {
    flex: 1,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(168, 122, 16, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: {
    fontSize: 24,
    fontWeight: '900',
    color: '#8A6208',
    textShadowColor: 'rgba(255, 248, 200, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  shadow: {
    marginTop: 6,
    width: SIZE * 0.7,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#000000',
  },
});

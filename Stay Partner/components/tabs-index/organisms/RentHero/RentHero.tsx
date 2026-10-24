import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Skeleton } from '@/components/common';
import { formatINR } from '@/lib/format';
import { monthLabel } from '@/components/rent-common';
import { RentCoin } from '../../atoms/RentCoin/RentCoin';
import { FLAT_HOME_CARDS, flatCard } from '@/components/tabs-index/flat';

type Props = {
  toCollect: number;
  collected: number;
  month: string | null;
  loading?: boolean;
};

/** A number that rolls up to its value instead of appearing at it. */
function useCountUp(target: number, animate: boolean) {
  const [shown, setShown] = useState(animate ? 0 : target);
  const from = useRef(animate ? 0 : target);

  useEffect(() => {
    if (!animate) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = from.current;
    const began = Date.now();
    const duration = 900;
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - began) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(start + (target - start) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, animate]);

  return shown;
}

/**
 * The Rent & Residents banner — light mint, the same pastel family as the
 * Bookings and Payouts cards and the tiles below it. Two numbers: what is
 * owed today or earlier, and what has come in this month.
 *
 * It arrives tilted back in 3D and settles flat, a light sweeps across it now
 * and then, a gold coin turns beside the title, and the figures count up.
 * All of it is skipped with reduced motion.
 */
export function RentHero({ toCollect, collected, month, loading }: Props) {
  const reduceMotion = useReducedMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  const shine = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    enter.value = withSpring(1, { damping: 14, stiffness: 120, mass: 0.9 });
    shine.value = withDelay(
      700,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 3200 }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
  }, [reduceMotion, enter, shine]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0, 0.4, 1], [0, 1, 1]),
    transform: [
      { perspective: 900 },
      { translateY: interpolate(enter.value, [0, 1], [28, 0]) },
      { rotateX: `${interpolate(enter.value, [0, 1], [24, 0])}deg` },
      { scale: interpolate(enter.value, [0, 1], [0.94, 1]) },
    ],
  }));

  const shineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shine.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
    transform: [
      { translateX: interpolate(shine.value, [0, 1], [-160, 460]) },
      { rotateZ: '20deg' },
    ],
  }));

  const animateNumbers = !reduceMotion && !loading;
  const shownToCollect = useCountUp(toCollect, animateNumbers);
  const shownCollected = useCountUp(collected, animateNumbers);

  return (
    <Animated.View style={[styles.cardContainer, flatCard, cardStyle]}>
      <LinearGradient
        colors={FLAT_HOME_CARDS ? ['transparent', 'transparent'] : ['#F0FDF4', '#ECFDF5', '#F0F9FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBg}
      >
        {/* Soft light from the top-left corner, for depth — and the sweep.
            Both need the card behind them, so a flat home drops them. */}
        {FLAT_HOME_CARDS ? null : <View pointerEvents="none" style={styles.glow} />}

        <Animated.View pointerEvents="none" style={[styles.shine, shineStyle, FLAT_HOME_CARDS && styles.hidden]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>LAMPOSE Stay Partner</Text>
            <Text style={styles.subtitle}>Your PG. Your residents. Your rent.</Text>
          </View>
          <RentCoin />
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>To collect</Text>
            {loading ? (
              <Skeleton width={90} height={24} radius={6} />
            ) : (
              <Text style={styles.statValue}>{formatINR(shownToCollect)}</Text>
            )}
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statLabel}>
              Collected{month ? ` in ${monthLabel(month).split(' ')[0]}` : ''}
            </Text>
            {loading ? (
              <Skeleton width={90} height={24} radius={6} />
            ) : (
              <Text style={styles.statValue}>{formatINR(shownCollected)}</Text>
            )}
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  gradientBg: {
    padding: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  glow: {
    position: 'absolute',
    top: -90,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  hidden: { display: 'none' },
  shine: {
    position: 'absolute',
    top: -60,
    bottom: -60,
    width: 90,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleBlock: { flex: 1 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    marginTop: 4,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(6, 78, 59, 0.12)',
  },
  stat: { flex: 1, gap: 4 },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(6, 78, 59, 0.12)',
    marginHorizontal: 14,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 22,
    color: '#064E3B',
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});

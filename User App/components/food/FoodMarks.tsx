import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import type { Diet } from '@/types/food';
import { DIET_LABEL } from '@/types/food';

/* ------------------------------------------------------------------ *
 * Diet mark
 * ------------------------------------------------------------------ */

/**
 * The veg / egg / non-veg mark.
 *
 * Shape carries it, colour confirms it: a dot in a green square, a dot in an
 * caution square, a triangle in a red square. This is the same rule the booking
 * statuses follow — and here it is also the mark Indian food packaging has
 * been teaching people to read for twenty years, so inventing anything else
 * would be strictly worse than copying it.
 *
 * It is always the FIRST element of a dish title line, on every surface. A
 * student scanning for veg runs a finger down the left edge of the list; a
 * mark that sometimes sits after the name breaks that in the only place it
 * matters.
 */
export function DietMark({ diet, size = 14 }: { diet: Diet; size?: number }) {
  const { colors } = useTheme();

  const ink =
    diet === 'veg' ? colors.success.base : diet === 'egg' ? colors.warning.base : colors.danger.base;
  const inner = Math.round(size * 0.38);

  return (
    <View
      accessibilityLabel={DIET_LABEL[diet]}
      style={[
        styles.dietMark,
        { width: size, height: size, borderColor: ink, borderRadius: Math.round(size * 0.22) },
      ]}
    >
      {diet === 'nonveg' ? (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: inner / 1.6,
            borderRightWidth: inner / 1.6,
            borderBottomWidth: inner,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: ink,
          }}
        />
      ) : (
        <View style={{ width: inner, height: inner, borderRadius: 999, backgroundColor: ink }} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Rating
 * ------------------------------------------------------------------ */

/**
 * A rating, with its count when there is room for it.
 *
 * A kitchen with four ratings and a kitchen with two thousand are not the same
 * 4.4, so the count is not decoration. Under ten ratings the number is dropped
 * entirely for the word "New" — an average of two opinions is noise dressed as
 * a measurement.
 */
export function RatingPill({
  rating,
  count,
  showCount = false,
}: {
  rating: number;
  count?: number;
  showCount?: boolean;
}) {
  const { colors, space, radius } = useTheme();

  if (count !== undefined && count < 10) {
    return (
      <View
        style={[
          styles.ratingPill,
          { backgroundColor: colors.surfaceSunken, borderRadius: radius.chip, paddingHorizontal: space[2] },
        ]}
      >
        <Text variant="numMeta" color="secondary">
          New
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.ratingPill,
        { backgroundColor: colors.brandTint, borderRadius: radius.chip, paddingHorizontal: space[2] - 2, gap: 3 },
      ]}
    >
      <Icon name="star" size={16} color={colors.warning.base} />
      <Text variant="numMeta" style={{ color: colors.brandInk }}>
        {rating.toFixed(1)}
        {showCount && count !== undefined ? ` · ${count}` : ''}
      </Text>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* ------------------------------------------------------------------ *
 * Veg only
 * ------------------------------------------------------------------ */

/**
 * The veg filter, carrying the mark it filters by.
 *
 * It is a filter and it says so — it hides non-veg dishes rather than warning
 * about them. That is the opposite of the diet *preference* in settings, which
 * only pre-selects, and the two are deliberately shaped differently so they
 * cannot be confused: this is a chip on a feed, that is a radio row in a list.
 */
export function VegOnlyToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const { colors, space, radius } = useTheme();

  const scale = useSharedValue(1);
  const toggleAnim = useSharedValue(value ? 1 : 0);
  const iconScale = useSharedValue(1);
  const iconRotate = useSharedValue(0);

  React.useEffect(() => {
    toggleAnim.value = withTiming(value ? 1 : 0, { duration: 200 });
    if (value) {
      iconScale.value = withSequence(
        withTiming(1.35, { duration: 120 }),
        withSpring(1, { damping: 8, stiffness: 200 })
      );
      iconRotate.value = withSequence(
        withTiming(-0.25, { duration: 100 }),
        withSpring(0, { damping: 10, stiffness: 180 })
      );
    } else {
      iconScale.value = withTiming(1, { duration: 150 });
      iconRotate.value = withTiming(0, { duration: 150 });
    }
  }, [value]);

  const handlePressIn = () => {
    scale.value = withSpring(0.93, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  };

  const containerStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      toggleAnim.value,
      [0, 1],
      [colors.surface, colors.brandTint]
    );
    const borderColor = interpolateColor(
      toggleAnim.value,
      [0, 1],
      [colors.border, colors.brand]
    );

    return {
      backgroundColor,
      borderColor,
      transform: [{ scale: scale.value }],
    };
  });

  const iconAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: iconScale.value },
        { rotate: `${iconRotate.value}rad` },
      ],
    };
  });

  return (
    <AnimatedPressable
      onPress={() => onChange(!value)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel="Veg only"
      style={[
        styles.vegToggle,
        containerStyle,
        {
          borderRadius: radius.pill,
          paddingHorizontal: space[3] - 2,
          gap: space[1] + 2,
        },
      ]}
    >
      <Animated.View style={iconAnimatedStyle}>
        <DietMark diet="veg" size={13} />
      </Animated.View>
      <Text variant="label" style={{ color: value ? colors.brandInk : colors.textSecondary, letterSpacing: 0.3 }}>
        Veg only
      </Text>
    </AnimatedPressable>
  );
}

/* ------------------------------------------------------------------ *
 * Photo well
 * ------------------------------------------------------------------ */

/** Hard-edged diagonal stripes, built out of a gradient's repeated stops. */
function stripes(a: string, b: string) {
  const bands = 12;
  const colors: string[] = [];
  const locations: number[] = [];
  for (let index = 0; index < bands; index += 1) {
    const color = index % 2 === 0 ? a : b;
    colors.push(color, color);
    locations.push(index / bands, (index + 1) / bands);
  }
  return { colors, locations };
}

export type FoodPhotoProps = {
  height: number;
  width?: number | `${number}%`;
  radius?: number;
  /** The photo itself. Absent is the normal case, not the error case. */
  uri?: string;
  /** Small caption inside the well. Only shown while there is no photo. */
  label?: string;
  style?: ViewStyle;
  /** Dims the well to match a closed kitchen's card. */
  muted?: boolean;
};

/**
 * A dish or kitchen photo, and the well it sits in.
 *
 * The well is drawn FIRST and the image on top of it, which is what makes the
 * missing case free: no `onError` handler, no loading state, no layout shift.
 * A URL that is absent, slow or dead simply leaves the stripes showing, and the
 * row around it never moves.
 *
 * That ordering is not a detail here. Kitchens this size have no photographer,
 * and roughly half of what onboarding collects will be missing or unusable at
 * launch — so the layout has to be correct WITHOUT a photo and merely nicer
 * with one. Striped rather than blank, because a flat grey rectangle reads as a
 * bug and a striped one reads as a placeholder.
 *
 * Closed kitchens dim the photo as well as the well: a full-colour picture of
 * biryani on a card that cannot be ordered from is an advertisement for
 * disappointment.
 */
export function FoodPhoto({ height, width = '100%', radius: r, uri, label, style, muted }: FoodPhotoProps) {
  const { colors, radius } = useTheme();
  const { colors: stops, locations } = stripes(
    muted ? colors.surfaceRaised : colors.surfaceSunken,
    muted ? colors.bg : colors.border,
  );

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: r ?? radius.chip, overflow: 'hidden' },
        styles.photo,
        style,
      ]}
    >
      <LinearGradient
        colors={stops as unknown as readonly [string, string, ...string[]]}
        locations={locations as unknown as readonly [number, number, ...number[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, muted ? styles.mutedPhoto : null]}
          contentFit="cover"
          /* Cached to disk because a student scrolls the same six kitchens
             several times a day on a data plan they are counting. */
          cachePolicy="memory-disk"
          transition={160}
          accessible={false}
        />
      ) : label ? (
        <Text variant="numMeta" color="tertiary" style={styles.photoLabel}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dietMark: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  vegToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  photo: { alignItems: 'center', justifyContent: 'flex-end' },
  photoLabel: { marginBottom: 6 },
  mutedPhoto: { opacity: 0.45 },
});

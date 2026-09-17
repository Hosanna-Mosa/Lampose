import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Box } from '@/components/common';
import { LinearGradient } from 'expo-linear-gradient';
import colors from '@/constants/colors';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';
import { HERO_WIPE_MS } from '@/components/tabs-index/utils';
import { HeroCardBody } from '@/components/tabs-index/organisms/HeroCardBody';

export function HeroCard({
  greetingText,
  owner,
  available,
}: {
  greetingText: string;
  /** Null until the profile carries a name. Greeted without one rather than
      greeted as somebody else — 'Anjali' was the fixture, and addressing an
      owner by a stranger's name is worse than addressing them by none. */
  owner: string | null;
  available: boolean;
}) {
  const c = useColors();

  const label = `${greetingText}${owner ? `, ${owner}` : ''}. ${available ? 'Rooms available, accepting bookings' : 'Not accepting new bookings'}.`;

  /*
   * FIFTH ATTEMPT, a different category this time. Four prior techniques for
   * a left-to-right WIPE all broke this card in different ways — reanimated
   * worklets, core `Animated` with a measured pixel translate, core
   * `Animated` with a percentage `left`, and a plain `requestAnimationFrame`
   * loop rewriting `LinearGradient`'s own `colors`/`locations` every frame.
   * Three of those never touched the gradient's own props; the fourth had no
   * nesting at all. What every one of them DID share is JS-thread work on
   * every single animation frame — a React re-render, or a `setNativeProps`
   * call, once per frame for the animation's whole duration.
   *
   * This is a plain opacity CROSSFADE instead of a wipe, using
   * `useNativeDriver: true`. That's not a smaller version of the same idea —
   * once `.start()` fires, the JS thread does nothing at all until the
   * animation finishes; the native side owns every frame on its own. It's
   * the one thing left that doesn't share the trait every failed attempt had
   * in common. If this ALSO breaks, that says something more fundamental
   * than "wrong animation technique" and is worth stopping to investigate
   * properly rather than trying a sixth approach blind.
   */
  const fade = useRef(new Animated.Value(available ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: available ? 1 : 0,
      duration: HERO_WIPE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [available]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box style={styles.hero} accessible accessibilityLabel={label}>
      {/* Bottom layer: white, normal flow — this is what actually sizes the
          card. Static props, never touched once mounted. */}
      <Box style={[styles.heroLayer, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderCard }]}>
        <HeroCardBody c={c} greetingText={greetingText} owner={owner} tone="off" />
      </Box>

      {/* Top layer: green, laid exactly over the white one. Only its OWN
          opacity is animated — the LinearGradient inside it never has a
          prop touched during the animation, matching the one thing every
          working version so far has had in common. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { opacity: fade }]}
      >
        <LinearGradient colors={[c.accent, c.accentHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroLayer}>
          <HeroCardBody c={c} greetingText={greetingText} owner={owner} tone="on" />
        </LinearGradient>
      </Animated.View>
    </Box>
  );
}

/** One tone's worth of the hero card's content — the glyph, greeting and chip. */

import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

/**
 * The listing detail's hero, as a swipeable set of photographs.
 *
 * It replaces a single static image with a "1 / 3" counter beside it that
 * never moved — the count was real, the paging was not, so a listing with
 * three photographs showed one and claimed three.
 *
 * ## It never advances on its own
 *
 * There is no timer here and there is not going to be one. A hero that
 * rotates by itself moves the photograph out from under somebody who is
 * looking at it, and on this screen they are looking at it to decide whether
 * to spend a deposit — enlarging the room they will actually sleep in, or
 * checking whether the bathroom shot is of a different building. Autoplay
 * also fights the swipe: a rotation that fires mid-gesture reads as the phone
 * mis-tracking the finger.
 *
 * ## Vertical scroll still belongs to the page
 *
 * This sits inside `PhotoHero`, which is itself inside the screen's vertical
 * scroll view. `directionalLockEnabled` keeps a mostly-vertical drag going to
 * the page rather than being captured here, which is what stops the hero
 * swallowing a scroll that started on the photograph.
 */

export type HeroCarouselProps = {
  photos: readonly string[];
  /** Matches the hero slot, so the image fills it without letterboxing. */
  height: number;
  /** Opens the full-screen gallery. Receives the page that was tapped. */
  onPressPhoto?: (index: number) => void;
};

export function HeroCarousel({ photos, height, onPressPhoto }: HeroCarouselProps) {
  const { colors, space, radius } = useTheme();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  /* One photograph is not a carousel. Rendering it as one would offer a
     swipe that goes nowhere and a "1 / 1" that says nothing. */
  if (photos.length <= 1) {
    return (
      <View style={{ width, height, backgroundColor: colors.surfaceSunken }}>
        {photos[0] ? (
          <Pressable onPress={() => onPressPhoto?.(0)} style={StyleSheet.absoluteFill}>
            <Image source={{ uri: photos[0] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        /* iOS: a drag that is mostly vertical goes to the page under this,
           rather than being captured as a sloppy horizontal swipe. */
        directionalLockEnabled
        /* The photographs are the content; the pager should not add its own
           inset on a notched device. */
        contentInsetAdjustmentBehavior="never"
      >
        {photos.map((uri, page) => (
          <Pressable
            key={uri}
            onPress={() => onPressPhoto?.(page)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Photo ${page + 1} of ${photos.length}. Opens the gallery.`}
            style={{ width, height, backgroundColor: colors.surfaceSunken }}
          >
            <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </Pressable>
        ))}
      </ScrollView>

      {/*
        Dots and a counter, not one or the other.

        The dots say how far along you are without reading; the counter says
        how many there are in total, which dots stop communicating past about
        six. Both sit over a scrim-darkened photograph, so they are white with
        their own shadow rather than themed — a token colour here would
        disappear against a pale room shot.
      */}
      <View style={[styles.dots, { bottom: space[3], gap: 5 }]} pointerEvents="none">
        {photos.map((uri, dot) => (
          <View
            key={uri}
            style={{
              width: dot === index ? 18 : 6,
              height: 6,
              borderRadius: radius.pill,
              backgroundColor: '#FFFFFF',
              opacity: dot === index ? 1 : 0.5,
            }}
          />
        ))}
      </View>

      <View
        style={[styles.counter, { bottom: space[3], right: space[3], borderRadius: radius.chip }]}
        pointerEvents="none"
      >
        <Text variant="numMeta" style={styles.counterText}>
          {index + 1} / {photos.length}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    position: 'absolute',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(26,25,23,0.55)',
  },
  counterText: { color: '#FFFFFF' },
});

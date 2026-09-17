import React, { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { TypographyScope } from '@/context/TypographyContext';
import { PromoBanner } from './PromoBanner';
import { buildPromoSlides } from './promoSlides';

/**
 * The Food module, advertised in the dead time of a stay request.
 *
 * ## Why here
 *
 * The owner-confirmation screen is the one place in this app that asks
 * somebody to WAIT. The request is with the owner, nothing on the screen can
 * be acted on, and the honest copy under the buttons says so — "they usually
 * answer within a minute or two". That minute used to end in a blank half
 * screen. It is the single best-qualified audience the food module has: a
 * student who has just chosen where they are going to live, is sitting still,
 * and has to eat tonight regardless of what the owner says.
 *
 * ## It is the hero, not a copy of it
 *
 * The slides, the autoplay, the parallax, the rising steam, the scooter
 * driving its measured route, the count-up numbers and the filling pagination
 * bar are all `PromoBanner` — the same component and the same
 * `buildPromoSlides` the Food home screen runs. Rebuilding a smaller
 * "advert version" would have meant a second set of artwork coordinates to
 * keep in step, and they are measured off the pictures to three decimal
 * places.
 *
 * Two things differ, and only two: the banner is inset to the page's gutter
 * and rounded, because here it is an object ON a page rather than the top OF
 * one; and every slide's tap goes to Food home instead of Food search, since
 * somebody arriving from a waiting screen has not asked for a dish yet.
 *
 * ## Leaving does not cost the request
 *
 * Nothing here cancels anything. The request lives on the server, the owner's
 * answer arrives in Alerts, and this screen is reachable again from there —
 * which is the same promise "Keep browsing while I wait" already makes one
 * button higher.
 */
export function FoodWaitPromo() {
  const { colors, space, layout } = useTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();

  /*
   * `/home?tab=food` rather than a `/food/...` route.
   *
   * Food home is a TAB on the home screen, not a screen of its own — the
   * module's own routes (`foodHref`) are all the pages BELOW it. `home.tsx`
   * reads this param once, to seed which tab it opens on.
   */
  const openFood = useCallback(() => {
    router.push({ pathname: '/home', params: { tab: 'food' } });
  }, [router]);

  const slides = React.useMemo(() => buildPromoSlides(openFood), [openFood]);

  /* The banner's own width, so the pager snaps to the card rather than to the
     screen it is inset from — see `PromoBannerProps.width`. */
  const cardWidth = Math.round(width - layout.gutter * 2);

  /*
   * Shorter than the artwork, and cropped rather than squashed.
   *
   * At its own ratio this is very nearly square — about 300dp on a 360dp
   * phone — which is right for a hero that IS the top of a screen and far too
   * much for a card sitting under two buttons on a screen somebody is only
   * passing through. 1.9 gives a landscape block around 170dp that reads as
   * an advert rather than a second page.
   *
   * `PromoBanner` takes the difference out of the top and bottom of the
   * picture, with the steam and the scooter cropping along with it — see the
   * note on `stageHeight` there. So this is a free number to tune: nothing
   * downstream has to be re-measured when it changes.
   */
  const cardHeight = Math.round(cardWidth / 1.9);

  return (
    <View style={{ gap: space[3] }}>
      <View style={[styles.captionRow, { gap: space[2] }]}>
        <Icon name="food" size={18} color={colors.warning.ink} />
        <Text variant="bodyStrong" style={{ color: colors.textPrimary, flex: 1 }}>
          While you wait — food on Lampose
        </Text>
      </View>

      {/* `overflow: 'hidden'` is what gives the artwork the corner, since the
          pages inside are full-bleed within this box and would otherwise
          square off its edges. */}
      <View
        style={[
          styles.card,
          {
            width: cardWidth,
            height: cardHeight,
            borderRadius: 10,
            backgroundColor: colors.surfaceSunken,
          },
        ]}
      >
        {/* The third food typography boundary, for the same reason as the
            other two (`app/food/_layout.tsx` and the Food tab in `home.tsx`):
            this is module content rendered inside a STAY screen, so without
            the scope any slide carrying a `headline` or `body` would be set
            in the stay scale. None of the four do today — their lettering is
            drawn from `headlineArt` at measured point sizes — which is
            exactly why it is worth stating before one does. */}
        <TypographyScope module="food">
          <PromoBanner slides={slides} width={cardWidth} height={cardHeight} />
        </TypographyScope>
      </View>

      <Text variant="numMeta" color="tertiary" style={styles.centred}>
        Your room request keeps running while you browse
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  captionRow: { flexDirection: 'row', alignItems: 'center' },
  card: { overflow: 'hidden', alignSelf: 'center' },
  centred: { textAlign: 'center' },
});

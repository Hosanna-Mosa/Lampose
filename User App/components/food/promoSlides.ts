import type { PromoSlide } from './PromoBanner';

/**
 * The Food hero's slides, in one place.
 *
 * They lived inside `FoodHome` until the waiting screen wanted them too:
 * `FoodWaitPromo` runs the same carousel while a student waits on an owner,
 * and two copies of four measured artworks — every steam plume, every point
 * of the scooter's route — is two copies that drift. The only thing that
 * differs between the callers is where a tap goes, so that is the argument.
 */
export function buildPromoSlides(onPress: () => void): PromoSlide[] {
  /*
   * The block's slides — whole-block artwork, one file each.
   *
   * A slide here is not a strip under a header any more; it IS the header.
   * Each file carries the background AND the message in one picture, drawn
   * at 1.5, and the locality line and search field are laid over its clean
   * upper third. That is what finally makes the top of this screen one
   * surface: there is no seam to hide, because there is no longer a second
   * thing.
   *
   * `headline`/`body`/`metric` stay absent for the same reason as before —
   * the lettering is baked in, and a second set drawn over it would collide
   * with the first.
   *
   * ## Ratios, and the reconstruction three of these needed
   *
   * The pager has exactly ONE height, so every file here has to be 1.5.
   * Only `fullfirst` was drawn that way; `fullsecond`, `fullthird` and
   * `fullfourth` arrived at 2.0, which at 1.5 would have lost 12.5% off
   * each side and cut into the lettering. Rather than crop them, the build
   * step mirrored each one's top rows upward and blurred them: mirroring
   * puts row 0 next to row 0, so the join cannot show, and the blur stops
   * the mirrored content being readable. The original's own top 150 rows
   * are then feathered from that blur into focus, or the blurred band ends
   * against sharp leaves and its rectangle is visible.
   *
   * Artwork drawn at 3:2 needs none of this. It is worth asking for.
   *
   * The earlier 2.38 strips (`banner-brighter-mood.jpg`,
   * `banner-street-bites.jpg`, `banner-delivered.jpg`,
   * `banner-first-order.jpg`) and `hero-spices.jpg` are all superseded now
   * and referenced by nothing.
   *
   * ## The 50%-off slide
   *
   * `banner-full-first-order.jpg` promises a discount this app cannot yet
   * honour — every order it has ever written carries `discount: 0`, so a
   * diner who taps it arrives at full price. That was raised twice and
   * included anyway, deliberately, so this is a note rather than an
   * argument: the slide comes out, or the discount gets built, before this
   * is in front of real diners. It is the one thing on this screen that
   * breaks the rule the rest of the module keeps — see
   * `RestaurantListCard` on why no card here ever shows a percentage.
   *
   * Every slide carries `onPress`, because every one of these images has a
   * button PAINTED into it. See `PromoSlide.onPress`.
   */
  const slides: PromoSlide[] = [
    {
      id: 'full-brighter-mood',
      tone: 'brand',
      image: require('../../assets/images/banner-full-brighter-mood.jpg'),
      /* Measured off `new1.png` itself, not estimated: the painted plume
         leaves the biryani at 64% of the picture's height and has faded out
         by 49%, centred on 68% of its width. The moving puffs start inside
         the painted ones and carry on past where they stop. */
      /* The words are NOT in this file any more — the build step lifted them
         out and the app draws them, so they can move. Coordinates and the
         yellow are both measured off `new1.png`, which still has them. */
      headlineArt: {
        x: 0.06,
        y: 0.548,
        eyebrow: 'GOOD FOOD',
        /* Cap heights read off the painted words, converted to point sizes
           for a 360dp card: 6.1dp, 20.8dp and 22.7dp of cap. "Mood" really
           is set larger than "Brighter" in the original. */
        eyebrowSize: 9,
        line1: 'Brighter',
        line1Size: 29,
        line2: 'Mood',
        line2Size: 32,
        accent: '#FFE604',
      },
      /* `strength` 1 — this is the banner the default was tuned against. Its
         shaded green garden gives white steam the most contrast of the
         four, so it needs no help. */
      steam: [{ x: 0.68, y: 0.64, rise: 0.24, spread: 0.13, strength: 1 }],
      onPress,
      label: 'Order now — find dishes and kitchens near you',
    },
    {
      id: 'full-delivered',
      tone: 'brand',
      /* A PLATE — the scooter has been taken out of this file and is layered
         over it by `rider` below, so it can be driven. */
      image: require('../../assets/images/banner-full-delivered.jpg'),
      rider: {
        image: require('../../assets/images/banner-full-delivered-bike.png'),
        aspect: 1.313,
        size: 0.36,
        /*
         * Every point sits inside the road, and so does every point BETWEEN
         * them — which is the part the earlier versions got wrong.
         *
         * The road is found by colour (dark blue, green channel under 115,
         * against bright water over 140) and its centreline walked row by
         * row from the pin downward, each row taking the run nearest the
         * one above it. Sampling columns independently does not work here:
         * at x 0.86 a column meets the ribbon near the top AND the broad
         * near road at the bottom, with WATER between them. Reading that as
         * one span is what put a path segment across open water — the
         * scooter rode correctly for a while and then struck out across the
         * river, which is exactly what it looked like.
         *
         * ## Why it stops short of the pin
         *
         * Walked properly, the ribbon above y 0.88 is a tight S and between
         * 0.5% and 4% of the card wide. That is a route line on a map, not
         * a road with room for a vehicle: a scooter scaled to sit inside it
         * is about 17dp across and reads as a speck, and one scaled to be
         * visible covers the whole thing. So the ride ends at the top of the
         * first sweep and fades, which is what going into the distance looks
         * like anyway. Reaching the marker was a nice idea that the artwork
         * will not support.
         *
         * Scale falls faster than distance because the road is receding —
         * equal steps in TIME are unequal steps in the picture.
         */
        path: [
          { x: 0.62, y: 0.99, scale: 1.0, tilt: -2 },
          { x: 0.7, y: 0.972, scale: 0.88, tilt: -2 },
          { x: 0.78, y: 0.952, scale: 0.74, tilt: -3 },
          { x: 0.84, y: 0.93, scale: 0.6, tilt: -3 },
          { x: 0.888, y: 0.911, scale: 0.48, tilt: -3 },
          { x: 0.93, y: 0.893, scale: 0.39, tilt: -2 },
          /* 0.32 rather than 0.27. Still a three-fold reduction, so the
             recession reads — but small enough and it stops looking like
             distance and starts looking like the scooter disappearing. */
          { x: 0.965, y: 0.876, scale: 0.32, tilt: -2 },
        ],
      },
      onPress,
      label: 'Order now — your favourite food, delivered',
    },
    {
      id: 'full-first-order',
      tone: 'caution',
      image: require('../../assets/images/banner-full-first-order.jpg'),
      /* Two, both measured off `new2.png`: the coconut chutney bowl at 68%
         across and the filter coffee tumbler at 77%. The coffee's is the
         smaller and shorter of the pair, because a tumbler that size does
         not throw the plume a full bowl does — a matched pair would read as
         two copies of one effect rather than as two hot things. */
      /* Pushed harder than the green banner: this one steams against a lit
         orange sky, where white has far less of the range to itself. */
      steam: [
        { x: 0.679, y: 0.632, rise: 0.22, spread: 0.12, strength: 1.2 },
        { x: 0.774, y: 0.661, rise: 0.16, spread: 0.09, strength: 1.2 },
      ],
      onPress,
      label: 'New user offer — flat 50% off your first order',
    },
    {
      id: 'full-street-bites',
      tone: 'caution',
      image: require('../../assets/images/banner-full-street-bites.jpg'),
      /* The chai glass, measured off `new3.png` — 61% across, leaving the
         glass at 58% down. The noodles beside it are being lifted cold on
         chopsticks and get none: steam on food the picture does not show as
         hot is the same kind of lie as a badge with no data behind it. */
      /* The hardest of the three, and pushed hardest. White steam on a pale
         pink sky is a small step however opaque it is — this is close to the
         ceiling of what the effect can do here, and if it still reads faint
         the fix is a warmer, greyer steam rather than a more opaque white. */
      steam: [{ x: 0.613, y: 0.583, rise: 0.22, spread: 0.105, strength: 1.35 }],
      onPress,
      label: 'Explore a wide variety of cuisines near you',
    },
  ];

  return slides;
}

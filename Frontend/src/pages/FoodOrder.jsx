import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Article, Aside, Box, Heading, Inline, Input, Label, PlainButton, Region, Strong, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { SecHead } from '../components/common/molecules/SecHead/SecHead';
import { DietMark } from '../components/food/atoms/DietMark';
import { PhotoTile } from '../components/food/atoms/PhotoTile';
import { KitchenCard } from '../components/food/molecules/KitchenCard';
import { ActiveOrder } from '../components/food/organisms/ActiveOrder';
import { DockedCart } from '../components/food/organisms/DockedCart';
import { useAddDish } from '../food/useAddDish';
import { useCart } from '../food/CartProvider';
import { useReveals } from '../hooks/useSite';
/* The formatters stay in `data/food.js` — they are copy, not data. Every
   ARRAY that file used to export now comes from the server through the
   catalogue provider below. */
import { rupees } from '../data/food';
import { useFoodCatalogue } from '../food/FoodCatalogue';

/* ══ Order Food ═══════════════════════════════════════════════════════════
   The feed: which kitchens will cook for this address, right now.

   ## Every kitchen here is a food partner with an approved menu

   Not a curated selection: the ratings are the restaurant's own and nothing is
   boosted. The ORDER is open kitchens first, then nearest when the visitor's
   address carries a pin and delivery time when it does not — nobody picks it,
   because there is nothing here to pick it with.

   ## There are two controls on this page

   The search box in the bar at the top, and the cuisine row. A filters bar
   stood under the cuisines — veg mode, "Open now", "Rating 4.0+", "Free
   delivery", "Under ₹150", a kitchen count and a sort — and it is gone.

   Its "Open now" chip defaulted to ON, which is the part worth remembering:
   a kitchen that opens at five was missing from this page all afternoon, and
   the only thing saying so was a chip nobody had pressed. Now every kitchen
   lists and a closed one sorts to the bottom.

   ## A closed kitchen still lists

   With its opening time on the card. A kitchen that disappears at 4 pm and
   returns at 5 reads, to somebody who was looking at it, as a kitchen that
   left the platform.
   ════════════════════════════════════════════════════════════════════════ */

/*
 * Smallest first - with "we do not know" LAST.
 *
 * Every one of these figures is 0 or null when the kitchen has not supplied it:
 * no preparation time gives a delivery time of 0, and a kitchen with no dishes
 * has a cost for one of 0. Sorted as plain numbers, 0 is the smallest, so an
 * empty kitchen was ranked FASTEST and CHEAPEST - it led the feed under both.
 * Unknown is not a small number; it goes to the back.
 */
const known = value => Number.isFinite(value) && value > 0;
const ascending = pick => (a, b) => {
  const x = pick(a);
  const y = pick(b);
  if (!known(x)) return known(y) ? 1 : 0;
  if (!known(y)) return -1;
  return x - y;
};

/* Two orderings, chosen by whether the visitor's address has a pin — see
   `sortBy` below. Rating and cost-for-one were options on the sort control
   that stood in the filters bar; the control is gone and so are they. */
const SORTS = {
  nearest: { by: ascending(k => k.walkMinutes) },
  time: { by: ascending(k => k.deliveryMinutes) },
};

/* What a diner can still narrow this page by: a search box and one cuisine. */
const EMPTY = { q: '', cuisine: 'all' };

export function FoodOrder() {
  const [filters, setFilters] = useState(EMPTY);
  const { address } = useCart();
  const { openDish, dialogs } = useAddDish();

  /* The real catalogue. `serviceable` stays false until the visitor's point
     falls inside some kitchen's own delivery radius — see the card below,
     which says so rather than naming a suburb nobody confirmed. */
  const {
    kitchens: allKitchens, cuisines: CUISINES, serviceable, kitchensReaching,
    popular, loading, error, refresh, kitchenById, dishById, dishesOf,
  } = useFoodCatalogue();

  /*
   * The order, which nobody picks any more: the sort control went with the
   * filters bar.
   *
   * "Nearest first" is only a real sort when the server knew where the visitor
   * is. Without a location every kitchen's `walkMinutes` is null, the
   * comparator returns 0 for every pair and the list keeps whatever order it
   * arrived in — which is why this still checks rather than always asking for
   * nearest. With a pinned address the list is nearest-first; without one it
   * is by delivery time, which is a real ordering either way.
   */
  const hasDistance = allKitchens.some(k => k.walkMinutes != null);
  const sortBy = hasDistance ? 'nearest' : 'time';

  useReveals([filters, sortBy, allKitchens]);

  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));

  const kitchens = useMemo(() => {
    const q = filters.q.trim().toLowerCase();

    const rows = allKitchens.filter(k => {
      if (filters.cuisine !== 'all' && !k.cuisineTypes.includes(filters.cuisine)) return false;
      if (!q) return true;
      /* The box says “biryani, thali, or a kitchen name”, so a dish name has
         to find its kitchen — searching only the kitchen's own fields makes
         a promise the results break. */
      /* Menus are fetched per kitchen, so this matches the ones already
         opened this session. A kitchen whose menu has not been loaded is
         still found by its own fields below — the search never gets WORSE
         than the kitchen-name search it promises, it gets better once a menu
         is in memory. */
      const onTheMenu = dishesOf(k.id).some(d => d.name.toLowerCase().includes(q));
      return onTheMenu || [k.name, k.cuisine, k.landmark, ...k.cuisineTypes]
        .some(field => String(field).toLowerCase().includes(q));
    });

    /* Copied before sorting: `allKitchens` is the provider's array and
       `sort` is in place, so sorting it here would reorder the shared
       catalogue under every other page. */
    /* Open kitchens first whatever the sort: with "Open now" switched off, a
       closed kitchen should follow the ones that can take an order, not sit
       among them on the strength of a good rating. */
    return [...rows].sort((a, b) => (Number(b.openNow) - Number(a.openNow)) || SORTS[sortBy].by(a, b));
  }, [allKitchens, dishesOf, filters, sortBy]);

  /* Ranked by the server — see `/dishes/popular`. Empty until dishes carry
     ratings, and the strip below hides itself rather than showing a heading
     over nothing. */

  return (
    <Region id="food">
      <Box className="sec-inner">

        <ActiveOrder />

        {/* ── where it is going, and what is being looked for ───────────── */}
        <Box className="fd-bar">
          <Box className="fd-bar__where">
            <Inline className="fd-bar__pin"><Icon name="pin" className="fd-ico" /></Inline>
            <Box className="fd-bar__addr">
              <Inline className="fd-lbl">Deliver to</Inline>
              <Inline className="fd-bar__addrName">{address?.title || 'Pick an address'}</Inline>
            </Box>
            {/* The address page, not the checkout: there is no cart on this
                screen, and the checkout answers an empty one with "there is
                nothing to pay for". */}
            <Link to="/food/address?next=/food" className="fd-link">
              {address ? 'Change' : 'Add'}
            </Link>
          </Box>

          <Box className="fd-search">
            <Icon name="search" className="fd-ico" />
            <Label className="fd-sr" htmlFor="fd-q">Search kitchens or dishes</Label>
            <Input
              id="fd-q"
              type="search"
              placeholder="Search “biryani”, “thali”, or a kitchen name"
              value={filters.q}
              onChange={e => set('q', e.target.value)}
            />
          </Box>
        </Box>

        <Box className="fd-intro">
          <Box className="fd-intro__head">
            <SecHead
              tag="Food"
              title="Kitchens near you,"
              em="cooking right now."
              sub="Every kitchen below is a Lampose food partner with an approved menu. Timings, prices and the delivery fee are the restaurant’s own. The delivery time is our estimate: the kitchen’s preparation time plus a typical ride."
              align="left"
              mb="0"
            />
          </Box>
          {/* Whether anybody can actually cook for this visitor, counted from
              the kitchens whose own delivery radius covers their point. A
              COUNT rather than a place name: nothing here knows what the
              visitor's suburb is called, and "we deliver to Gachibowli" was
              the fixture's guess. A delivery promise is the last thing to
              invent. */}
          <Aside className="fd-reach reveal">
            <Text className="fd-lbl">{serviceable ? 'Serviceable' : 'Delivery area'}</Text>
            <Text className="fd-reach__body">
              {serviceable
                ? <>
                  <Strong>{kitchensReaching}</Strong>
                  {kitchensReaching === 1 ? ' kitchen delivers' : ' kitchens deliver'} to you.
                </>
                : 'Add your address to see whether we deliver to you.'}
            </Text>
            <Link to="/food/address?next=/food" className="fd-link">
              {serviceable ? 'Check another address →' : 'Check your address →'}
            </Link>
          </Aside>
        </Box>

        {/* ── cuisines ──────────────────────────────────────────────────── */}
        <Box className="fd-rail" role="group" aria-label="Cuisines">
          <PlainButton
            type="button"
            className={`fd-chipBtn${filters.cuisine === 'all' ? ' is-on' : ''}`}
            onClick={() => set('cuisine', 'all')}
          >
            All kitchens
          </PlainButton>
          {CUISINES.map(cuisine => (
            <PlainButton
              key={cuisine}
              type="button"
              className={`fd-chipBtn${filters.cuisine === cuisine ? ' is-on' : ''}`}
              onClick={() => set('cuisine', filters.cuisine === cuisine ? 'all' : cuisine)}
            >
              {cuisine}
            </PlainButton>
          ))}
        </Box>

        {/*
            The filters bar stood here: veg mode, "Open now", "Rating 4.0+",
            "Free delivery", "Under ₹150", the kitchen count and a sort
            control. All of it is gone.

            What that leaves is the cuisine row above and the search box in the
            bar at the top, which is the whole of what a diner picks from now.
            The ORDERING is unchanged and is not a filter: open kitchens first,
            then nearest when the visitor's address has a pin and delivery time
            when it does not.

            One behaviour changed with it rather than being hidden: "Open now"
            defaulted to ON, so a kitchen that opens at five was missing from
            this page all afternoon with a chip nobody had pressed explaining
            it. Closed kitchens now list, at the bottom, with their opening
            time on the card — which is what the card was built to say.
        */}

        {/* ── the kitchens ──────────────────────────────────────────────── */}
        {/*
            Three states, and they are deliberately three. While the catalogue
            was a fixture there was only ever a list; a fetch has two more
            answers, and "we could not reach the server" must never be drawn
            as "no kitchen matches all of that" — one is our fault and worth
            retrying, the other is a real answer to what was asked.
        */}
        {loading ? (
          <Box className="fd-empty reveal">
            <Heading level={2} className="fd-empty__title">Finding kitchens near you…</Heading>
          </Box>
        ) : error ? (
          <Box className="fd-empty reveal">
            <Inline className="fd-empty__mark"><Icon name="search" className="fd-ico" /></Inline>
            <Heading level={2} className="fd-empty__title">We could not load the kitchens</Heading>
            <Text className="fd-empty__body">
              {error.status === 503
                ? 'The kitchen list is briefly unavailable. It is usually back within a minute.'
                : 'Something went wrong reaching Lampose. Your cart is safe.'}
            </Text>
            <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={refresh}>
              Try again
            </PlainButton>
          </Box>
        ) : kitchens.length ? (
          <Box className="fd-grid">
            {kitchens.map((kitchen, i) => <KitchenCard key={kitchen.id} kitchen={kitchen} index={i} />)}
          </Box>
        ) : (
          <Box className="fd-empty reveal">
            <Inline className="fd-empty__mark"><Icon name="search" className="fd-ico" /></Inline>
            <Heading level={2} className="fd-empty__title">Nothing matches that</Heading>
            <Text className="fd-empty__body">
              {filters.q
                ? `Nothing here is called “${filters.q}”, and no menu we have loaded has a dish by that name.`
                : 'No kitchen is filed under that cuisine yet.'}
            </Text>
            <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={() => setFilters(EMPTY)}>
              Show every kitchen
            </PlainButton>
          </Box>
        )}

        {/* ── popular in your PG ────────────────────────────────────────── */}
        {popular.length > 0 && (
          <Box className="fd-section">
            <Box className="fd-section__head">
              {/* Not "in your PG" and not "what Block C ordered": there is no
                  per-hostel order count, and the strip is ranked by how many
                  people have RATED a dish. Said as exactly that. */}
              <Heading level={2} className="fd-h2">Popular right now</Heading>
              <Inline className="fd-section__sub">The most-rated dishes across Lampose kitchens</Inline>
            </Box>

            <Box className="fd-dishGrid">
              {popular.map(dish => {
                const kitchen = kitchenById(dish.kitchenId);
                return (
                  <Article className="fd-mini reveal" key={dish.id}>
                    <PhotoTile tone={dish.tone} src={dish.imageUrl} alt={dish.name} width={160} className="fd-mini__thumb" />
                    <Box className="fd-mini__text">
                      <Box className="fd-mini__head">
                        <DietMark diet={dish.diet} size={13} />
                        <Heading level={3} className="fd-mini__name">{dish.name}</Heading>
                      </Box>
                      {/* `kitchen` can be null: the popular strip is ranked
                          across every listed kitchen, and a filter or a limit
                          may mean its kitchen is not in the loaded feed. */}
                      <Text className="fd-mini__meta">
                        {[kitchen?.name, dish.ratingCount ? `${dish.ratingCount} ratings` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      <Box className="fd-mini__foot">
                        <Inline className="fd-mini__price">{rupees(dish.price)}</Inline>
                        <PlainButton
                          type="button"
                          className="fd-add"
                          onClick={() => openDish(dishById(dish.id))}
                        >
                          ADD
                        </PlainButton>
                      </Box>
                    </Box>
                  </Article>
                );
              })}
            </Box>
          </Box>
        )}

        <DockedCart />
      </Box>

      {dialogs}
    </Region>
  );
}

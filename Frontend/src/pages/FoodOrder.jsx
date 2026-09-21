import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Article, Aside, Box, Heading, Inline, Input, Label, Option, PlainButton, Region, Select, Strong, Text,
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

   The list is `data/food.js` while the ordering surface is a prototype — see
   the note at the top of that file. What it is NOT is a curated selection:
   the order is the sort the visitor picked, the ratings are the restaurant's
   own, and nothing is boosted.

   ## Veg mode has three states, because it is two questions

   Off, veg dishes, pure-veg kitchens. Hiding a dish and hiding a kitchen are
   different things: a diner who orders veg from a mixed kitchen is served by
   most of this city, and a diner who will not order from a kitchen that
   cooks meat at all is served by neither of the other two settings. A
   two-state switch forces one of those two people to be wrong.

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

const SORTS = {
  nearest: { label: 'Nearest first', by: ascending(k => k.walkMinutes) },
  rating: { label: 'Rating', by: (a, b) => b.rating - a.rating },
  time: { label: 'Delivery time', by: ascending(k => k.deliveryMinutes) },
  cost: { label: 'Cost for one', by: ascending(k => k.costForOne) },
};

const EMPTY = {
  q: '', cuisine: 'all', veg: 'off', openNow: true, rated: false, freeDelivery: false, cheap: false,
};

export function FoodOrder() {
  const [filters, setFilters] = useState(EMPTY);
  const [chosenSort, setSortBy] = useState('nearest');
  const { address, fulfilment, setFulfilment } = useCart();
  const { openDish, dialogs } = useAddDish();

  /* The real catalogue. `area` is null until the visitor's point resolves to
     a service zone — see the Serviceable card below, which says so rather
     than naming a suburb nobody confirmed. */
  const {
    kitchens: allKitchens, cuisines: CUISINES, area: AREA, serviceable,
    popular, loading, error, refresh, kitchenById, dishById, dishesOf,
  } = useFoodCatalogue();

  /*
   * "Nearest first" is only a real sort when the server knew where the visitor
   * is. Without a location every kitchen's `walkMinutes` is null, the
   * comparator returns 0 for every pair, and the list stays in whatever order
   * it arrived in - while the control above it says "Nearest first". A label
   * that promises an ordering nothing performed is the kind of small lie this
   * page has been stripped of everywhere else.
   *
   * So the option is offered only when it works, and a visitor whose chosen
   * sort has stopped being available falls back to delivery time rather than
   * to a silently unsorted list.
   */
  const hasDistance = allKitchens.some(k => k.walkMinutes != null);
  const sortBy = chosenSort === 'nearest' && !hasDistance ? 'time' : chosenSort;
  const sortChoices = Object.entries(SORTS).filter(([key]) => key !== 'nearest' || hasDistance);

  useReveals([filters, sortBy, allKitchens]);

  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));

  const kitchens = useMemo(() => {
    const q = filters.q.trim().toLowerCase();

    const rows = allKitchens.filter(k => {
      if (filters.cuisine !== 'all' && !k.cuisineTypes.includes(filters.cuisine)) return false;
      /* Veg mode hides a KITCHEN only in its strictest setting; the middle
         setting is about dishes, and the menu page applies it. */
      if (filters.veg === 'restaurants' && !k.pureVeg) return false;
      if (filters.openNow && !k.openNow) return false;
      if (filters.rated && k.rating < 4) return false;
      if (filters.freeDelivery && k.deliveryFee > 0) return false;
      if (filters.cheap && k.costForOne > 150) return false;
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

  const chips = [
    { key: 'openNow', label: 'Open now' },
    { key: 'rated', label: 'Rating 4.0+' },
    { key: 'freeDelivery', label: 'Free delivery' },
    { key: 'cheap', label: 'Under ₹150' },
  ];

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
            <Link to="/food/checkout" className="fd-link">Change</Link>
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

          <Box className="fd-seg" role="group" aria-label="Delivery or pickup">
            <PlainButton
              type="button"
              className={`fd-seg__btn${fulfilment === 'delivery' ? ' is-on' : ''}`}
              onClick={() => setFulfilment('delivery')}
            >
              Delivery
            </PlainButton>
            <PlainButton
              type="button"
              className={`fd-seg__btn${fulfilment === 'pickup' ? ' is-on' : ''}`}
              onClick={() => setFulfilment('pickup')}
            >
              Pickup
            </PlainButton>
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
          {/* The area, only when a real service zone answered for the
              visitor's point. Without one there is nothing honest to put
              here — "we deliver to Gachibowli" was the fixture's guess, and a
              delivery promise is the last thing to invent. */}
          <Aside className="fd-zone reveal">
            <Text className="fd-lbl">{serviceable ? 'Serviceable' : 'Delivery area'}</Text>
            <Text className="fd-zone__body">
              {serviceable && AREA
                ? <>We deliver to <Strong>{AREA.locality}</Strong>.</>
                : 'Add your address to see whether we deliver to you.'}
            </Text>
            <Link to="/food/checkout" className="fd-link">
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

        {/* ── filters ───────────────────────────────────────────────────── */}
        <Box className="fd-filters">
          <Inline className="fd-lbl">Veg mode</Inline>
          <Box className="fd-seg fd-seg--sm" role="group" aria-label="Veg mode">
            <PlainButton type="button" className={`fd-seg__btn${filters.veg === 'off' ? ' is-on' : ''}`} onClick={() => set('veg', 'off')}>Off</PlainButton>
            <PlainButton type="button" className={`fd-seg__btn${filters.veg === 'items' ? ' is-green' : ''}`} onClick={() => set('veg', 'items')}>Veg dishes</PlainButton>
            <PlainButton type="button" className={`fd-seg__btn${filters.veg === 'restaurants' ? ' is-green' : ''}`} onClick={() => set('veg', 'restaurants')}>Pure-veg kitchens</PlainButton>
          </Box>

          <Inline className="fd-divider" aria-hidden="true" />

          {chips.map(chip => (
            <PlainButton
              key={chip.key}
              type="button"
              aria-pressed={filters[chip.key]}
              className={`fd-chipBtn fd-chipBtn--sm${filters[chip.key] ? ' is-green' : ''}`}
              onClick={() => set(chip.key, !filters[chip.key])}
            >
              {chip.label}{filters[chip.key] ? ' ✕' : ''}
            </PlainButton>
          ))}

          <Inline className="fd-filters__spacer" />
          <Inline className="fd-filters__count">
            {kitchens.length} kitchen{kitchens.length === 1 ? '' : 's'}
          </Inline>
          <Label className="fd-sr" htmlFor="fd-sort">Sort kitchens</Label>
          <Select id="fd-sort" className="fd-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            {sortChoices.map(([key, sort]) => (
              <Option key={key} value={key}>{sort.label}</Option>
            ))}
          </Select>
        </Box>

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
            <Heading level={2} className="fd-empty__title">No kitchen matches all of that</Heading>
            <Text className="fd-empty__body">
              {filters.veg === 'restaurants'
                ? 'Pure-veg mode hides every kitchen that cooks meat at all. “Veg dishes” keeps the kitchens and filters their menus instead.'
                : filters.openNow
                  ? 'Some of these kitchens open later in the day — drop “Open now” to see them.'
                  : 'Drop a filter or two and they come back.'}
            </Text>
            <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={() => setFilters(EMPTY)}>
              Clear the filters
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

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
import {
  AREA, CUISINES, KITCHENS, dishById, dishesOf, kitchenById, popularInBlock, rupees,
} from '../data/food';

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

const SORTS = {
  nearest: { label: 'Nearest first', by: (a, b) => a.walkMinutes - b.walkMinutes },
  rating: { label: 'Rating', by: (a, b) => b.rating - a.rating },
  time: { label: 'Delivery time', by: (a, b) => a.deliveryMinutes - b.deliveryMinutes },
  cost: { label: 'Cost for one', by: (a, b) => a.costForOne - b.costForOne },
};

const EMPTY = {
  q: '', cuisine: 'all', veg: 'off', openNow: true, rated: false, freeDelivery: false, cheap: false,
};

export function FoodOrder() {
  const [filters, setFilters] = useState(EMPTY);
  const [sortBy, setSortBy] = useState('nearest');
  const { address, fulfilment, setFulfilment } = useCart();
  const { openDish, dialogs } = useAddDish();

  useReveals([filters, sortBy]);

  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));

  const kitchens = useMemo(() => {
    const q = filters.q.trim().toLowerCase();

    const rows = KITCHENS.filter(k => {
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
      const onTheMenu = dishesOf(k.id).some(d => d.name.toLowerCase().includes(q));
      return onTheMenu || [k.name, k.cuisine, k.landmark, ...k.cuisineTypes]
        .some(field => String(field).toLowerCase().includes(q));
    });

    return rows.sort(SORTS[sortBy].by);
  }, [filters, sortBy]);

  const chips = [
    { key: 'openNow', label: 'Open now' },
    { key: 'rated', label: 'Rating 4.0+' },
    { key: 'freeDelivery', label: 'Free delivery' },
    { key: 'cheap', label: 'Under ₹150' },
  ];

  const popular = popularInBlock();

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
              sub="Every kitchen below is a Lampose food partner with an approved menu. Timings, prices and the delivery fee are the restaurant’s own — nothing here is an estimate we invented."
              align="left"
              mb="0"
            />
          </Box>
          <Aside className="fd-zone reveal">
            <Text className="fd-lbl">Serviceable</Text>
            <Text className="fd-zone__body">
              We deliver to <Strong>{AREA.locality}</Strong> between <Strong>{AREA.openFrom} and {AREA.openTo}</Strong>.
            </Text>
            <Link to="/food/checkout" className="fd-link">Check another address →</Link>
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
            {Object.entries(SORTS).map(([key, sort]) => (
              <Option key={key} value={key}>{sort.label}</Option>
            ))}
          </Select>
        </Box>

        {/* ── the kitchens ──────────────────────────────────────────────── */}
        {kitchens.length ? (
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
              <Heading level={2} className="fd-h2">Popular in your PG this week</Heading>
              <Inline className="fd-section__sub">What Block C ordered most · updated daily</Inline>
            </Box>

            <Box className="fd-dishGrid">
              {popular.map(dish => {
                const kitchen = kitchenById(dish.kitchenId);
                return (
                  <Article className="fd-mini reveal" key={dish.id}>
                    <PhotoTile tone={dish.tone} className="fd-mini__thumb" />
                    <Box className="fd-mini__text">
                      <Box className="fd-mini__head">
                        <DietMark diet={dish.diet} size={13} />
                        <Heading level={3} className="fd-mini__name">{dish.name}</Heading>
                      </Box>
                      <Text className="fd-mini__meta">{kitchen.name} · {dish.ordersInBlock} orders</Text>
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

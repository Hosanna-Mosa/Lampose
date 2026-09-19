import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Anchor, Aside, Box, Heading, Inline, Input, Label, Region, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { DietMark } from '../components/food/atoms/DietMark';
import { PhotoTile } from '../components/food/atoms/PhotoTile';
import { DishRow } from '../components/food/molecules/DishRow';
import { ActiveOrder } from '../components/food/organisms/ActiveOrder';
import { DockedCart } from '../components/food/organisms/DockedCart';
import { useAddDish } from '../food/useAddDish';
import { useCart } from '../food/CartProvider';
import { useReveals } from '../hooks/useSite';
import { COUPONS, dietAllowed, dishById, dishesOf, kitchenById, rupees } from '../data/food';

/* ══ Kitchen ══════════════════════════════════════════════════════════════
   One restaurant: the facts, then the menu, with the cart alongside.

   Mounted at two paths. `/food/kitchen/:id` is the menu; `/food/dish/:dishId`
   is the same page with that dish's sheet already open — a shared link to a
   dish has to land somewhere a person can order from, and a dish on its own
   page, away from the kitchen's timings and minimum, is not that place.

   ## Veg only hides dishes, not the kitchen

   The switch in the rail filters the menu. It never removes the kitchen the
   visitor deliberately opened, and it says so under itself, because a diner
   who believes veg-only hides non-veg kitchens will order at the wrong
   counter once and never trust the setting again.

   ## A closed kitchen can be read, not ordered from

   Every ADD turns into a dead "Closed" chip and the header says when it
   opens. Hiding the menu of a kitchen that opens in an hour answers a
   question nobody asked.
   ════════════════════════════════════════════════════════════════════════ */

export function FoodKitchen() {
  const { id, dishId } = useParams();
  const { openDish, dialogs } = useAddDish();
  const { lines, bill, coupon, setQty, kitchenId: cartKitchenId } = useCart();

  /* A dish link decides the kitchen; a kitchen link is the kitchen. */
  const linkedDish = dishId ? dishById(dishId) : null;
  const kitchen = kitchenById(linkedDish ? linkedDish.kitchenId : id);

  /* Which section the reader is in. It was pinned to the first one, so the
     rail said "Recommended" all the way down a seven-section menu. */
  const [activeSection, setActiveSection] = useState(0);

  const [vegOnly, setVegOnly] = useState(false);
  const [withEgg, setWithEgg] = useState(false);
  const [hideSoldOut, setHideSoldOut] = useState(false);
  const [q, setQ] = useState('');

  useReveals([kitchen?.id, vegOnly, withEgg, hideSoldOut, q]);

  /* Opening a dish link opens its sheet, once. */
  useEffect(() => {
    if (linkedDish) openDish(linkedDish);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishId]);

  const dishes = useMemo(() => {
    if (!kitchen) return [];
    const needle = q.trim().toLowerCase();
    return dishesOf(kitchen.id).filter(dish => {
      if (vegOnly && !dietAllowed(dish.diet, 'items') && !(withEgg && dish.diet === 'egg')) return false;
      if (hideSoldOut && dish.soldOut) return false;
      if (!needle) return true;
      return `${dish.name} ${dish.description || ''}`.toLowerCase().includes(needle);
    });
  }, [kitchen, vegOnly, withEgg, hideSoldOut, q]);

  /* Sections in the order the kitchen wants them read, with "Recommended"
     built from the dishes that carry the flag rather than being a section of
     its own in the data — one dish belongs in both. */
  const sections = useMemo(() => {
    if (!kitchen) return [];
    const recommended = dishes.filter(d => d.recommended);
    const rest = kitchen.sections
      .filter(name => name !== 'Recommended')
      .map(name => ({ name, dishes: dishes.filter(d => d.section === name) }))
      .filter(section => section.dishes.length);
    return [
      ...(recommended.length ? [{ name: 'Recommended', dishes: recommended }] : []),
      ...rest,
    ];
  }, [kitchen, dishes]);

  const sectionCount = sections.length;

  /* The rail follows the menu, whether the reader jumped or scrolled.
     The band is the strip just under the fixed navbar: whichever section
     occupies it is the one being read, which is the same answer going down
     the page and coming back up. */
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('[data-sec]'));
    if (!nodes.length) return undefined;

    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setActiveSection(Number(entry.target.dataset.sec));
      });
    }, { rootMargin: '-96px 0px -70% 0px', threshold: 0 });

    nodes.forEach(node => io.observe(node));
    return () => io.disconnect();
  }, [sectionCount, kitchen?.id]);

  if (!kitchen) {
    return (
      <Region id="food">
        <Box className="sec-inner">
          <Box className="fd-empty">
            <Heading level={1} className="fd-empty__title">That kitchen is not on Lampose</Heading>
            <Text className="fd-empty__body">The link may be old, or the restaurant may have left.</Text>
            <Link to="/food" className="fd-btn fd-btn--dark">See the kitchens near you</Link>
          </Box>
        </Box>
      </Region>
    );
  }

  /* How many of this dish are already in the cart — the row shows a stepper
     instead of ADD once there are any, and steps the FIRST matching line. */
  const heldLines = cartKitchenId === kitchen.id ? lines : [];
  const qtyOf = dish => heldLines.filter(l => l.dishId === dish.id).reduce((n, l) => n + l.qty, 0);
  const firstLine = dish => heldLines.find(l => l.dishId === dish.id);

  const offers = COUPONS.filter(c => !c.kitchenId || c.kitchenId === kitchen.id).slice(0, 2);

  return (
    <Region id="food">
      <Box className="sec-inner">

        <ActiveOrder />

        <Box className="fd-crumbs" aria-label="Breadcrumb">
          <Link to="/food">Order Food</Link>
          <Inline aria-hidden="true">/</Inline>
          <Link to="/food">Gachibowli</Link>
          <Inline aria-hidden="true">/</Inline>
          <Inline className="fd-crumbs__here">{kitchen.name}</Inline>
        </Box>

        {/* ── the kitchen ───────────────────────────────────────────────── */}
        <Box className="fd-head reveal">
          <PhotoTile tone={kitchen.tone} className="fd-head__photo" label="Counter photo" />

          <Box className="fd-head__body">
            <Box className="fd-head__top">
              <Box>
                <Box className="fd-head__title">
                  <DietMark diet={kitchen.pureVeg ? 'veg' : 'nonveg'} size={17} />
                  <Heading level={1} className="fd-head__name">{kitchen.name}</Heading>
                  <Inline className={`fd-chip ${kitchen.openNow ? 'fd-chip--good' : 'fd-chip--neutral'}`}>
                    {kitchen.openNow ? `Open till ${kitchen.closesAt}` : `Opens at ${kitchen.opensAt}`}
                  </Inline>
                </Box>
                <Text className="fd-head__cuisine">{kitchen.cuisine} · {kitchen.tagline}</Text>
                <Text className="fd-head__where">{kitchen.landmark}, Gachibowli · {kitchen.walkMinutes} min walk from Block C</Text>
              </Box>

              <Box className="fd-head__score">
                <Inline className="fd-rating fd-rating--lg">{kitchen.rating} ★</Inline>
                <Inline className="fd-head__scoreCount">{kitchen.ratingCount.toLocaleString('en-IN')} ratings</Inline>
              </Box>
            </Box>

            <Box className="fd-facts">
              <Box className="fd-facts__cell">
                <Inline className="fd-lbl">Delivery</Inline>
                <Inline className="fd-facts__val">{kitchen.deliveryWindow}</Inline>
              </Box>
              <Box className="fd-facts__cell">
                <Inline className="fd-lbl">Counter ready</Inline>
                <Inline className="fd-facts__val">{kitchen.prepMinutes} min</Inline>
              </Box>
              <Box className="fd-facts__cell">
                <Inline className="fd-lbl">Delivery fee</Inline>
                <Inline className="fd-facts__val">{kitchen.deliveryFee ? rupees(kitchen.deliveryFee) : 'Free'}</Inline>
              </Box>
              <Box className="fd-facts__cell">
                <Inline className="fd-lbl">Minimum order</Inline>
                <Inline className="fd-facts__val">{rupees(kitchen.minOrder)}</Inline>
              </Box>
            </Box>

            {offers.length > 0 && (
              <Box className="fd-offers">
                {offers.map(offer => (
                  <Box className={`fd-offer${offer.kitchenId === kitchen.id ? ' is-live' : ''}`} key={offer.code}>
                    <Icon name="tag" className="fd-ico" />
                    <Box className="fd-offer__text">
                      <Inline className="fd-offer__code">{offer.code} · {offer.headline}</Inline>
                      <Inline className="fd-offer__body">{offer.body}</Inline>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        {/* ── menu ──────────────────────────────────────────────────────── */}
        <Box className="fd-menu">

          <Aside className="fd-menu__rail" aria-label="Menu sections">
            <Box className="fd-panel">
              <Text className="fd-lbl">Menu</Text>
              {sections.map((section, i) => (
                <Anchor
                  key={section.name}
                  href={`#sec-${i}`}
                  className={`fd-jump${i === activeSection ? ' is-on' : ''}`}
                  aria-current={i === activeSection ? 'true' : undefined}
                >
                  {section.name}
                  <Inline className="fd-jump__n">{section.dishes.length}</Inline>
                </Anchor>
              ))}
            </Box>

            <Box className="fd-panel">
              <Text className="fd-lbl">Filter dishes</Text>
              <Label className="fd-check">
                <Input type="checkbox" checked={vegOnly} onChange={e => setVegOnly(e.target.checked)} />
                <Inline>Veg only</Inline>
              </Label>
              <Label className="fd-check">
                <Input type="checkbox" checked={withEgg} disabled={!vegOnly} onChange={e => setWithEgg(e.target.checked)} />
                <Inline>Egg included</Inline>
              </Label>
              <Label className="fd-check">
                <Input type="checkbox" checked={hideSoldOut} onChange={e => setHideSoldOut(e.target.checked)} />
                <Inline>Hide sold out</Inline>
              </Label>
              <Text className="fd-note">Veg only hides dishes, never the kitchen.</Text>
            </Box>
          </Aside>

          <Box className="fd-menu__list">
            <Box className="fd-menu__tools">
              <Heading level={2} className="fd-h2">Menu</Heading>
              <Inline className="fd-section__sub">
                {dishes.length} dish{dishes.length === 1 ? '' : 'es'} across {sections.length} section{sections.length === 1 ? '' : 's'}
              </Inline>
              <Inline className="fd-filters__spacer" />
              <Box className="fd-search fd-search--sm">
                <Icon name="search" className="fd-ico" />
                <Label className="fd-sr" htmlFor="fd-menuq">Search this menu</Label>
                <Input
                  id="fd-menuq"
                  type="search"
                  placeholder="Search this menu"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
              </Box>
            </Box>

            {sections.length === 0 && (
              <Box className="fd-empty">
                <Heading level={3} className="fd-empty__title">Nothing on this menu matches</Heading>
                <Text className="fd-empty__body">
                  {vegOnly
                    ? 'This kitchen cooks non-veg too — turn veg only off to see the rest of the menu.'
                    : 'Try a shorter search.'}
                </Text>
              </Box>
            )}

            {sections.map((section, i) => (
              <Box className="fd-menu__section" data-sec={i} key={section.name}>
                <Heading level={2} className="fd-h2" id={`sec-${i}`}>{section.name}</Heading>
                <Box className="fd-panel fd-panel--list">
                  {section.dishes.map(dish => {
                    const line = firstLine(dish);
                    return (
                      <DishRow
                        key={`${section.name}-${dish.id}`}
                        dish={dish}
                        qty={qtyOf(dish)}
                        closed={!kitchen.openNow}
                        onOpen={() => openDish(dish)}
                        onLess={() => line && setQty(line.uid, line.qty - 1)}
                        onMore={() => line && setQty(line.uid, line.qty + 1)}
                      />
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Box>

          {/* ── the cart, beside the menu ───────────────────────────────── */}
          <Aside className="fd-menu__cart" aria-label="Your order">
            <Box className="fd-panel fd-panel--lift">
              <Box className="fd-panel__head">
                <Heading level={2} className="fd-panel__title">Your order</Heading>
                <Inline className="fd-section__sub">
                  {bill.count} item{bill.count === 1 ? '' : 's'}
                </Inline>
              </Box>

              {heldLines.length === 0 ? (
                <Text className="fd-note">
                  Nothing from {kitchen.name} yet. Add a dish and the bill builds here.
                </Text>
              ) : (
                <>
                  {heldLines.map(line => (
                    <Box className="fd-sum" key={line.uid}>
                      <DietMark diet={line.diet} size={14} />
                      <Box className="fd-sum__text">
                        <Inline className="fd-sum__name">{line.name}</Inline>
                        {(line.addOns?.length > 0 || line.note) && (
                          <Inline className="fd-sum__note">
                            {[...(line.addOns || []).map(a => a.label), line.note].filter(Boolean).join(' · ')}
                          </Inline>
                        )}
                      </Box>
                      <Inline className="fd-sum__qty">×{line.qty}</Inline>
                      <Inline className="fd-sum__price">{rupees(line.unitPrice * line.qty)}</Inline>
                    </Box>
                  ))}

                  <Box className="fd-rule" />
                  <Box className="fd-bill__row">
                    <Inline>Item total</Inline>
                    <Inline className="fd-bill__val">{rupees(bill.itemTotal)}</Inline>
                  </Box>
                  {bill.discount > 0 && (
                    <Box className="fd-bill__row fd-bill__row--save">
                      <Inline>{coupon.code} applied</Inline>
                      <Inline className="fd-bill__val">− {rupees(bill.discount)}</Inline>
                    </Box>
                  )}
                  {bill.shortOfMinimum > 0 && (
                    <Text className="fd-note fd-note--warn">
                      {rupees(bill.shortOfMinimum)} under this kitchen’s {rupees(kitchen.minOrder)} minimum.
                    </Text>
                  )}
                  <Text className="fd-note">
                    Packing and delivery are added at checkout. Lampose charges no tax on food orders.
                  </Text>
                  <Link to="/food/cart" className="fd-btn fd-btn--dark fd-btn--full">
                    Go to cart · {rupees(bill.itemTotal - bill.discount)}
                  </Link>
                </>
              )}
            </Box>

            <Box className="fd-panel">
              <Text className="fd-lbl">Kitchen details</Text>
              <Text className="fd-panel__body">
                FSSAI {kitchen.fssai}
                <br />
                {kitchen.hours}
              </Text>
              <Link to="/contact" className="fd-link">Report an issue with this kitchen →</Link>
            </Box>
          </Aside>
        </Box>

        <DockedCart className="fd-dock--narrow" />
      </Box>

      {dialogs}
    </Region>
  );
}

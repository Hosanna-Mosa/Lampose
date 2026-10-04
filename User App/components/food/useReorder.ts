/**
 * Reorder, shared by the Orders tab and an order's own screen.
 *
 * Moved here from `FoodOrders.tsx` unchanged — its long notes on WHY the
 * rebuild waits for the cleared cart and rebuilds options BY NAME still hold.
 * The order screen's "Order it again" only opened the kitchen; it now refills
 * the cart the same way, with the same honesty about what could not be.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { useFood } from '@/context/FoodContext';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import type { FoodOrder, SpiceLevel } from '@/types/food';

import { foodHref } from './routes';

const SPICE_LEVELS: readonly SpiceLevel[] = ['mild', 'medium', 'hot'];

/** "a", "a and b", "a, b and c" — a list as somebody would say it aloud. */
export function joinList(items: readonly string[]): string {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function useReorder() {
  const router = useRouter();
  const { findDish } = useFoodCatalogue();
  const { add, clear, kitchenId: cartKitchenId, cartKitchen, count } = useFood();

  const [reorderNote, setReorderNote] = useState<
    { title: string; message: string; kitchenId: string | null } | null
  >(null);

  /**
   * The order a Reorder tap has accepted but not yet rebuilt, with the name of
   * whatever cart it displaced. See the effect below for why it has to wait.
   */
  const [rebuilding, setRebuilding] = useState<
    { order: FoodOrder; displaced: string | null } | null
  >(null);

  /*
   * The tap: empty the cart, then hand the order to the effect underneath.
   *
   * The kitchen being displaced is read off HERE because `clear()` is about to
   * remove the only reference to it, and a cart silently thrown away is the
   * thing the switch sheet exists everywhere else to prevent. Reorder does not
   * get to ask — the cart is already gone by the time anything could be
   * rendered — so the least it can do is name what it took.
   */
  const reorder = (order: FoodOrder) => {
    setReorderNote(null);

    const displaced =
      cartKitchenId && cartKitchenId !== order.kitchenId && count > 0
        ? (cartKitchen?.name ?? 'another kitchen')
        : null;

    clear();
    setRebuilding({ order, displaced });
  };

  /*
   * Reorder rebuilds the cart from the order's dishes rather than cloning the
   * old total. Prices move, dishes leave the menu, and a "reorder" that charges
   * last week's number is the single fastest way to lose a student's trust in
   * every other number in the app.
   *
   * ## Why the rebuild is an effect and not the rest of the tap handler
   *
   * `add` is a memoised callback closing over the cart's CURRENT kitchen and
   * line count, and it refuses — 'conflict', for the switch sheet to pick up —
   * whenever those say another kitchen's food is already in the cart.
   * `clear()` only SCHEDULES that cart to empty; inside the handler that called
   * it, the `add` in scope is still the one built against the old cart. So
   * reordering three lines from a second kitchen used to hit 'conflict' on the
   * first line and stop: nothing added, nothing said, nowhere navigated, and a
   * switch sheet offering to re-add exactly one dish. Parking the order in
   * state lets React deliver the cleared cart first; by the time this runs,
   * `add` is the one that agrees the cart is empty and every line goes in.
   *
   * ## What is rebuilt, and how
   *
   * What was CHOSEN is rebuilt with the dish, and it has to be rebuilt BY NAME.
   * The portion and the add-ons survive on the order line as the words the
   * diner picked — that is what `note` is — while the ids behind them are
   * minted from the product id each time the menu is fetched, so last week's
   * ids match nothing today. Matching labels against the dish's current option
   * list is the only join that survives a refetch, and it fails safely: an
   * add-on the kitchen has withdrawn simply finds nothing.
   *
   * Whatever cannot be rebuilt is SAID. A silent drop is a student paying for
   * a plain dosa they believed had extra chutney on it and discovering the
   * difference at the door, so an incomplete reorder stops here with the
   * difference named and the cart one deliberate tap away.
   */
  useEffect(() => {
    if (!rebuilding) return;
    /* The clear has not landed yet — this render is still holding the old
       cart, and an `add` made against it would refuse every line. */
    if (cartKitchenId !== null || count > 0) return;

    const { order, displaced } = rebuilding;
    setRebuilding(null);

    const delisted: string[] = [];
    const unknown: string[] = [];
    const withdrawn: string[] = [];
    const refused: string[] = [];
    let added = 0;

    for (const line of order.lines) {
      const dish = line.dishId ? findDish(line.dishId) : undefined;
      /* Two different failures, and saying the wrong one is worse than saying
         nothing. `soldOut` is a fact the kitchen published today. A dish the
         catalogue simply does not hold is NOT that: `findDish` searches the
         menus that have been fetched, so an order from a kitchen whose menu is
         not loaded — or one that has since been delisted — returns undefined
         for every line. Telling a student their dosa is off the menu when it
         is on the counter is the kind of small lie that costs the next
         number's credibility. */
      if (!dish) {
        unknown.push(line.name);
        continue;
      }
      if (dish.soldOut) {
        delisted.push(line.name);
        continue;
      }

      const options = dish.addOns ?? [];
      const addOnIds: string[] = [];
      let spice: SpiceLevel | undefined;

      const chosen = (line.note ?? '').split(',').map((part) => part.trim()).filter(Boolean);
      for (const part of chosen) {
        const option = options.find((entry) => entry.label.toLowerCase() === part.toLowerCase());
        if (option) {
          addOnIds.push(option.id);
          continue;
        }
        const level = SPICE_LEVELS.find((value) => `${value} spice` === part.toLowerCase());
        if (level) {
          spice = level;
          continue;
        }
        withdrawn.push(`${part} on ${dish.name}`);
      }

      /* Every line of one order comes from one kitchen and the cart was empty
         a render ago, so nothing here should be refused. Counted rather than
         ignored anyway: the one thing this reorder must never do again is drop
         a line without saying so. */
      if (add(dish, { qty: line.qty, addOnIds, ...(spice ? { spice } : null) }) === 'conflict') {
        refused.push(line.name);
        continue;
      }
      added += 1;
    }

    const lost = [
      delisted.length ? `${joinList(delisted)} ${delisted.length === 1 ? 'is' : 'are'} off the menu today` : null,
      unknown.length
        ? `we could not find ${joinList(unknown)} on the menu just now`
        : null,
      withdrawn.length ? `${joinList(withdrawn)} ${withdrawn.length === 1 ? 'is' : 'are'} no longer offered` : null,
      refused.length ? `${joinList(refused)} could not be put in your cart` : null,
    ]
      .filter(Boolean)
      .join('. ');

    /* Nothing lost and nobody's cart taken: the ordinary reorder, straight
       through to a cart that now holds exactly what the order held. */
    if (!lost && !displaced) {
      router.push(foodHref.cart);
      return;
    }

    const tail = !added
      ? 'That leaves nothing to reorder.'
      : lost
        ? "The rest is in your cart, at today's prices."
        : "Everything from that order is in your cart, at today's prices.";

    setReorderNote({
      title: lost ? 'This reorder is not the same order' : 'Your cart was replaced',
      message: [displaced ? `Your cart from ${displaced} made way for this one.` : null, lost ? `${lost}.` : null, tail]
        .filter(Boolean)
        .join(' '),
      kitchenId: added ? null : order.kitchenId,
    });
  }, [rebuilding, cartKitchenId, count, add, findDish, router]);

  return { reorder, reorderNote, setReorderNote };
}

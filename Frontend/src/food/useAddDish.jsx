import { useCallback, useState } from 'react';
import { kitchenById } from '../data/food';
import { DishSheet } from '../components/food/organisms/DishSheet';
import { SwitchKitchenSheet } from '../components/food/organisms/SwitchKitchenSheet';
import { useCart } from './CartProvider';

/* ══════════════════════════════════════════════════════════════════════════
   Adding a dish, wherever it is added from.

   The feed's "popular in your PG" rail and the kitchen's menu both add
   dishes, and both have to handle the same two turns: the sheet that asks
   what goes on the plate, and the question that follows when the cart
   already holds another kitchen's food.

   Two copies of that is how one of them ends up silently throwing away a
   cart. So it lives here once, as a hook that hands back an opener and the
   dialogs to render:

     const { openDish, dialogs } = useAddDish();

   The confirm path re-runs the add with `replace`, rather than clearing the
   cart and hoping the second call lands — one writer, one outcome.
   ══════════════════════════════════════════════════════════════════════════ */

export function useAddDish() {
  const { add } = useCart();

  const [dish, setDish] = useState(null);
  /* The add that was refused, held whole so confirming can replay it. */
  const [pending, setPending] = useState(null);

  const openDish = useCallback(next => setDish(next), []);

  const submit = useCallback((forDish, choices) => {
    const result = add(forDish, choices);
    if (result.conflict) {
      setPending({ dish: forDish, choices, holding: result.conflict });
      return;
    }
    setDish(null);
  }, [add]);

  const confirmSwitch = useCallback(() => {
    if (!pending) return;
    add(pending.dish, { ...pending.choices, replace: true });
    setPending(null);
    setDish(null);
  }, [add, pending]);

  const dialogs = (
    <>
      {dish && (
        <DishSheet
          dish={dish}
          onClose={() => setDish(null)}
          onAdd={choices => submit(dish, choices)}
        />
      )}
      {pending && (
        <SwitchKitchenSheet
          holding={pending.holding}
          joining={{ name: kitchenById(pending.dish.kitchenId)?.name || 'this kitchen' }}
          onCancel={() => setPending(null)}
          onConfirm={confirmSwitch}
        />
      )}
    </>
  );

  return { openDish, dialogs };
}

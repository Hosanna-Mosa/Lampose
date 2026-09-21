import { useCallback, useEffect, useRef, useState } from 'react';
import { DishSheet } from '../components/food/organisms/DishSheet';
import { SwitchKitchenSheet } from '../components/food/organisms/SwitchKitchenSheet';
import { useCart } from './CartProvider';
import { useAuth } from '../auth/AuthProvider';
import { useFoodCatalogue } from './FoodCatalogue';

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
  const { isSignedIn, signInOpen, openSignIn } = useAuth();
  /* The kitchen behind a refused add, named in the "switch kitchen?" sheet.
     Read from the catalogue rather than a fixture — a synchronous lookup over
     kitchens the provider already holds, which is why it is a provider. */
  const { kitchenById } = useFoodCatalogue();

  const [dish, setDish] = useState(null);
  /* The add that was refused, held whole so confirming can replay it. */
  const [pending, setPending] = useState(null);

  /*
   * The add that is waiting for the visitor to sign in.
   *
   * Held WHOLE - the dish and everything they chose on the sheet - so that once
   * they are in, the add they asked for happens, rather than a sheet reopening
   * for them to fill in again. Separate from `pending` above, which is the
   * other kind of refusal (a cart already holding another kitchen).
   */
  const [awaitingSignIn, setAwaitingSignIn] = useState(null);
  /* Whether the sign-in panel has actually been SEEN open for this wait. The
     add and the panel are requested in the same event, but a render can land
     between them; without this, "the panel is closed and nobody is signed in"
     would read as "they gave up" one frame too early. */
  const sawPanel = useRef(false);

  const openDish = useCallback(next => setDish(next), []);

  const submit = useCallback((forDish, choices) => {
    const result = add(forDish, choices);
    if (result.authRequired) {
      /*
       * Not an error - a fork. The sheet is CLOSED before the panel opens.
       *
       * They are not in the same stacking context: the dish sheet's overlay
       * sits at z-index 8000 and the sign-in panel's at 1200, so leaving the
       * sheet up put the panel BEHIND it. The visitor pressed "Sign in to
       * add" and saw nothing happen. Closing it means the panel is the only
       * thing on screen, with no two modals fighting over focus - and the
       * dish and every option they chose are held in `awaitingSignIn`, so
       * nothing they picked is lost.
       */
      setAwaitingSignIn({ dish: forDish, choices });
      setDish(null);
      openSignIn();
      return;
    }
    if (result.conflict) {
      setPending({ dish: forDish, choices, holding: result.conflict });
      return;
    }
    setDish(null);
  }, [add, openSignIn]);

  /*
   * Carry on once the panel closes.
   *
   * NOT when the status flips to signed-in: the panel stays open for its name
   * step after the code is accepted, and adding to the cart behind a modal
   * they are still filling in would change the page under them. The panel
   * closing is the moment they have finished.
   *
   *   closed, signed in    -> do the add they asked for
   *   closed, not signed in -> they backed out. The dish sheet comes back so
   *                            they are where they were, and the held add is
   *                            forgotten - a sign-in through the navbar
   *                            tomorrow must not fire a stale add
   */
  useEffect(() => {
    if (!awaitingSignIn) { sawPanel.current = false; return; }
    if (signInOpen) { sawPanel.current = true; return; }
    if (!sawPanel.current) return;

    const wanted = awaitingSignIn;
    setAwaitingSignIn(null);
    if (isSignedIn) submit(wanted.dish, wanted.choices);
    else setDish(wanted.dish);
  }, [awaitingSignIn, signInOpen, isSignedIn, submit]);

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

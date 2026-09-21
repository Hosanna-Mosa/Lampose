import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFoodCatalogue } from './FoodCatalogue';
import {
  fetchAddresses, fetchCoupons, fetchOrders, placeFoodOrder,
} from '../api/foodApi';
import { useAuth } from '../auth/AuthProvider';
import {
  SPICE_LABEL, couponBlockedReason, couponByCode, lineUnitPrice, totals,
} from './cart';

/* ══════════════════════════════════════════════════════════════════════════
   The food order, for the whole site.

   ## Everything here is real

   READS: the kitchens and menus come from `FoodCatalogue`, the saved addresses
   and the order history from `/api/v2/food-web`, and the coupon list from the
   same place. A diner who is signed out simply has no addresses and no history
   rather than somebody else's.

   THE WRITE: `placeOrder` posts to `POST /api/v2/food-partners/orders` - the
   endpoint the Lampose app uses. The server prices the order from its own menu,
   writes it, tells the kitchen, and it appears in the restaurant admin's queue.
   Nothing is kept in this tab: there is no local copy of an order, so there is
   no way for the site to show an order the kitchen has never heard of.

   That is a change worth stating, because it used to be otherwise. `placeOrder`
   was a preview that built an order in memory and sent nothing - a visitor
   could press "Pay", be shown a confirmation, and have the kitchen never learn
   of it. It is CASH ON DELIVERY and PICKUP only for now: taking a card payment
   on the web needs the payment page to return to lampose.com, and its redirect
   allowlist only knows the app's `lampose://` links.

   The cart (not orders) is held in `sessionStorage`, and deliberately not in
   `localStorage`: a cart has to survive a reload but must not outlive the tab.
   A cart in localStorage is still there next week, priced from a menu that has
   since changed, and then it disagrees with the menu it came from. Closing the
   tab is the reset.

   Every read and write is wrapped: a private window, blocked site data or a
   half-written entry all fall back to an empty cart rather than throwing on
   the first render.

   ## One cart, one kitchen

   A cart carries dishes from a single kitchen, because an order is a ticket
   printed at one counter and a rider collects from one door. Adding from
   somewhere else does not silently clear the cart: `add` refuses and hands
   back the conflict, and the kitchen page asks before throwing the food away.

   ## An account is required to hold a cart

   Browsing is open to everybody; putting food in a cart, and paying for it, is
   not. A cart is a step towards an order, an order is placed by a person, and
   the server already refuses one from nobody (`POST /orders` is behind the
   customer guard) - so letting a visitor fill a cart and reach a payment
   screen only to be turned away there is a promise this site cannot keep.

   It is enforced HERE, in the one place that writes the cart, rather than only
   in the buttons that call it: `add`, `reorder` and `placeOrder` each answer a
   guest with `{ authRequired: true }` (or null) and change nothing. The UI
   sends them to sign in and, for an add, carries on where they left off - but
   a screen that forgets to check cannot slip a guest past this.

   And a cart cannot outlive its session. When the site knows the visitor is a
   guest - a fresh tab, a sign-out, an expired session - the cart is emptied, so
   a tab that held food from before the visitor signed out cannot carry it on to
   a payment screen.

   ## No seed

   The cart used to start with two dishes the designs were drawn around. With
   a real catalogue those dishes do not exist, and a cart that opens holding
   food nobody chose — priced from a menu that is not on sale — is the most
   misleading thing on the site. It starts empty.
   ══════════════════════════════════════════════════════════════════════════ */

const CartContext = createContext(null);

/* Bumped when the shape below changes, so a tab holding yesterday's shape
   starts again instead of rendering half a cart.

   v2 is not a shape change so much as a purge: every tab that opened the
   site while the catalogue was a fixture is holding a cart of dish ids like
   'am-thali' and a kitchen called 'annapurna-mess'. Neither exists now, and
   restoring them would put phantom food in a real diner's cart. */
const STORE_KEY = 'lampose.food.v2';

function readStore() {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return saved && Array.isArray(saved.lines) ? saved : null;
  } catch {
    return null;
  }
}

function writeStore(state) {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* Out of quota, or storage refused. The cart still works for this page
       view, which is more than throwing here would leave. */
  }
}

let seq = 0;
const nextUid = () => { seq += 1; return `line-${seq}`; };

/* An error the checkout page can show exactly as it stands: a sentence written
   for the diner, and a code that says which. The server's own refusals arrive in
   the same shape (`apiClient` puts its message and code on the Error), so the
   page handles a refusal from here and one from there with the same code. */
const problem = (message, code) => Object.assign(new Error(message), { code });

export function CartProvider({ children }) {
  /* Read once, at the first render: the stored cart if this tab has one,
     empty if it does not. */
  const [saved] = useState(readStore);

  const { user, isSignedIn, status } = useAuth();
  const {
    kitchens, loading: catalogueLoading, kitchenById, loadMenu,
  } = useFoodCatalogue();

  const [kitchenId, setKitchenId] = useState(saved ? saved.kitchenId : null);
  const [lines, setLines] = useState(() => (saved ? saved.lines : []));
  const [couponCode, setCouponCode] = useState(saved ? saved.couponCode : null);
  const [fulfilment, setFulfilment] = useState(saved?.fulfilment || 'delivery');
  /* Null until the diner's own addresses arrive and one is chosen. There is no
     default to fall back on any more: the fixture's "Block C · Room 214" was
     somebody's address, and a real diner has their own or none. */
  const [addressId, setAddressId] = useState(saved?.addressId || null);
  const [payment, setPayment] = useState(saved?.payment || 'upi');

  /* ── From the server ─────────────────────────────────────────────────── */

  /* Saved addresses, judged against the kitchen the cart is holding. Empty
     when signed out: an address is somebody's, and there is nobody. */
  const [addresses, setAddresses] = useState([]);
  /* This diner's history. Same rule. */
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  /* Coupons the server will actually HONOUR — see the effect below. */
  const [coupons, setCoupons] = useState([]);

  /* A line's uid has to stay unique across a reload, or the next ADD collides
     with a restored line and steps the wrong row. */
  useState(() => {
    const restored = (saved?.lines || []).map(l => Number(String(l.uid).split('-')[1]) || 0);
    seq = Math.max(seq, ...restored, 0);
  });

  useEffect(() => {
    writeStore({ kitchenId, lines, couponCode, fulfilment, addressId, payment });
  }, [kitchenId, lines, couponCode, fulfilment, addressId, payment]);

  /*
   * No session, no cart.
   *
   * `status === 'guest'` and NOT `!isSignedIn`: for the first frame of every
   * page load the status is 'hydrating' - the stored session has not been read
   * yet - and treating that as "signed out" would empty a signed-in visitor's
   * cart on every reload. Only a settled 'guest' clears anything.
   *
   * The setters are called unconditionally and are no-ops once already empty
   * (React bails out on an identical value), so this cannot loop.
   */
  useEffect(() => {
    if (status !== 'guest') return;
    setLines(prev => (prev.length ? [] : prev));
    setKitchenId(null);
    setCouponCode(null);
  }, [status]);

  const kitchen = kitchenId ? kitchenById(kitchenId) : null;
  const coupon = couponCode ? couponByCode(couponCode, coupons) : null;
  const address = addresses.find(a => a.id === addressId) || null;

  /*
   * A cart for a kitchen that is no longer on the feed cannot be ordered.
   *
   * It happens when a tab is left open while a kitchen switches itself off,
   * or is rejected — the row is gone from the catalogue and the cart is
   * holding food from a menu nobody can buy. Cleared rather than kept, and
   * only once the catalogue has actually answered with kitchens: an empty
   * list from a FAILED fetch would otherwise wipe every cart on a network
   * blip.
   */
  useEffect(() => {
    if (catalogueLoading || !kitchens.length || !kitchenId) return;
    if (!kitchenById(kitchenId)) {
      setLines([]);
      setKitchenId(null);
      setCouponCode(null);
    }
  }, [catalogueLoading, kitchens, kitchenId, kitchenById]);

  /* Keep the cart kitchen's menu in memory. The cart page opens a dish sheet
     from a line, and a cart restored from `sessionStorage` after a reload has
     a kitchen but no menu until something asks for it. */
  useEffect(() => { if (kitchenId) loadMenu(kitchenId); }, [kitchenId, loadMenu]);

  /*
   * The diner's addresses, each judged against the kitchen in the cart.
   *
   * Refetched when the kitchen changes because the verdict is per kitchen —
   * the same door can be inside one kitchen's delivery area and outside
   * another's, and the checkout has to say so before anybody pays.
   */
  useEffect(() => {
    if (!isSignedIn) { setAddresses([]); return undefined; }
    let live = true;
    fetchAddresses({ kitchenId })
      .then(res => { if (live) setAddresses(res.addresses || []); })
      /* A failed address fetch leaves the list empty, and the checkout says
         "add an address" — which is recoverable. Throwing here would take
         the whole cart down over one list. */
      .catch(() => { if (live) setAddresses([]); });
    return () => { live = false; };
  }, [isSignedIn, kitchenId]);

  /* Choose an address once they arrive: the one already chosen if it still
     exists, else the diner's default, else the first serviceable one, else the
     first at all. A chosen id that has since been deleted is dropped rather
     than left pointing at nothing. */
  useEffect(() => {
    if (!addresses.length) { if (addressId) setAddressId(null); return; }
    if (addresses.some(a => a.id === addressId)) return;
    const pick = addresses.find(a => a.isDefault)
      || addresses.find(a => a.serviceable)
      || addresses[0];
    setAddressId(pick.id);
  }, [addresses, addressId]);

  /*
   * The coupons the server will honour — and NONE of the others.
   *
   * `enforced` is the server's own statement of whether an order will subtract
   * the coupon. Today no coupon is enforced (the order controller bills with
   * `discount: 0`), so this list is empty and the cart never shows a discount
   * the payment screen would then refuse. Filtering here rather than in
   * `cart.js` keeps that file arithmetic-only.
   */
  useEffect(() => {
    let live = true;
    fetchCoupons({ kitchenId })
      .then(rows => { if (live) setCoupons(rows.filter(c => c.enforced)); })
      .catch(() => { if (live) setCoupons([]); });
    return () => { live = false; };
  }, [isSignedIn, kitchenId]);

  /* The diner's order history. Signed out there is none.

     Every read takes a number, and only the NEWEST answer is kept: the load
     after placing an order and the refresh below can be in flight together, and
     whichever finishes last must not be an older read overwriting a newer one. */
  const historyRequest = useRef(0);
  const loadHistory = useCallback(async () => {
    const mine = historyRequest.current + 1;
    historyRequest.current = mine;
    if (!isSignedIn) { setHistory([]); return; }
    setHistoryLoading(true);
    try {
      const res = await fetchOrders({ limit: 30 });
      if (mine === historyRequest.current) setHistory(res.orders || []);
    } catch {
      if (mine === historyRequest.current) setHistory([]);
    } finally {
      if (mine === historyRequest.current) setHistoryLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  /*
   * Keeps the list CURRENT while an order is in play.
   *
   * The pill in the header and the "Track order" bar on every food page read
   * this list, and it used to be read once - when the page opened, and after an
   * order was placed - and never again. So an order the kitchen had accepted,
   * started cooking and sent out still said "Waiting for the kitchen" up in the
   * corner, while the tracking page (which polls its own order) said something
   * else entirely: two places on one screen disagreeing about the same order.
   *
   * Every fifteen seconds while anything is live - the same beat as the tracking
   * page - and straight away when the tab comes back to the front, which is when
   * a phone that was in a pocket needs it. Nothing polls once every order has
   * finished, or while the tab is hidden.
   *
   * QUIET, unlike `loadHistory`: no loading flag (a list that flashed a skeleton
   * every fifteen seconds would be worse than a stale one) and a failed read
   * keeps what is on screen rather than blanking it - a dropped connection on a
   * phone must not make an order vanish from the banner.
   */
  const anyLive = history.some(order => order.live);
  useEffect(() => {
    if (!isSignedIn || !anyLive) return undefined;

    const refresh = async () => {
      if (document.hidden) return;
      const mine = historyRequest.current + 1;
      historyRequest.current = mine;
      try {
        const res = await fetchOrders({ limit: 30 });
        if (mine === historyRequest.current) setHistory(res.orders || []);
      } catch { /* keep what is on screen */ }
    };

    const timer = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isSignedIn, anyLive]);

  const bill = useMemo(
    () => totals({ lines, kitchen, coupon, fulfilment }),
    [lines, kitchen, coupon, fulfilment],
  );

  /**
   * Put a dish in the cart.
   *
   * Returns `{ conflict: kitchen }` — and changes nothing — when the cart
   * already holds another kitchen's food. Pass `replace: true` to start the
   * cart again at the new kitchen, which is what the switch sheet's confirm
   * button does.
   */
  const add = useCallback((dish, { qty = 1, addOns = [], spice = null, note = '', replace = false } = {}) => {
    /* A guest cannot hold a cart. Refused before anything else is read, and
       nothing is changed - the caller decides what to do about it. */
    if (!isSignedIn) return { authRequired: true };

    const held = lines.length ? kitchenId : null;
    if (held && held !== dish.kitchenId && !replace) {
      return { conflict: kitchenById(held) };
    }

    const fresh = {
      uid: nextUid(),
      dishId: dish.id,
      name: dish.name,
      diet: dish.diet,
      basePrice: dish.price,
      addOns,
      spice,
      note: note.trim(),
      qty,
      unitPrice: lineUnitPrice(dish, addOns),
    };

    const starting = replace && held !== dish.kitchenId;
    setKitchenId(dish.kitchenId);
    if (starting) setCouponCode(null);

    setLines(prev => {
      const base = starting ? [] : prev;
      /* The same dish with the same choices is a quantity, not a second row —
         two identical lines in a cart is a bill nobody can read. */
      const twin = base.find(l => l.dishId === fresh.dishId
        && l.spice === fresh.spice
        && l.note === fresh.note
        && l.addOns.map(a => a.id).sort().join() === addOns.map(a => a.id).sort().join());
      if (twin) return base.map(l => (l === twin ? { ...l, qty: l.qty + qty } : l));
      return [...base, fresh];
    });

    return { ok: true };
  }, [isSignedIn, kitchenId, kitchenById, lines.length]);

  const setQty = useCallback((uid, qty) => {
    setLines(prev => (qty <= 0
      ? prev.filter(l => l.uid !== uid)
      : prev.map(l => (l.uid === uid ? { ...l, qty } : l))));
  }, []);

  const remove = useCallback(uid => setLines(prev => prev.filter(l => l.uid !== uid)), []);

  const clear = useCallback(() => {
    setLines([]);
    setCouponCode(null);
  }, []);

  /** `{ ok }`, or `{ error }` in the words the field shows under itself. */
  const applyCoupon = useCallback(code => {
    const found = couponByCode(code, coupons);
    if (!found) return { error: 'No offer with that code' };
    const blocked = couponBlockedReason(found, {
      itemTotal: bill.itemTotal, kitchenId, fulfilment,
    });
    if (blocked) return { error: blocked };
    setCouponCode(found.code);
    return { ok: true };
  }, [bill.itemTotal, coupons, kitchenId, fulfilment]);

  const removeCoupon = useCallback(() => setCouponCode(null), []);

  /* Rebuild a past order's cart at TODAY's prices — the receipt keeps what
     was charged then, and a reorder that re-charged last month's price would
     be quoting a number the kitchen never agreed to. */
  const reorder = useCallback(async order => {
    if (!isSignedIn) return { ok: false, authRequired: true, dropped: 0 };

    /* The menu may not have been opened this session. Awaited rather than
       assumed: matching against an unloaded menu finds nothing, and a reorder
       would report every dish as dropped. Sold-out dishes are skipped for the
       same reason a dropped one is — they cannot be ordered today. */
    const menu = await loadMenu(order.kitchenId);
    const rebuilt = order.lines
      .map(l => {
        const dish = menu.find(d => d.name === l.name && !d.soldOut);
        if (!dish) return null;
        return {
          uid: nextUid(),
          dishId: dish.id,
          name: dish.name,
          diet: dish.diet,
          basePrice: dish.price,
          addOns: [],
          spice: null,
          note: '',
          qty: l.qty,
          unitPrice: dish.price,
        };
      })
      .filter(Boolean);

    /* Nothing rebuilt: leave the cart exactly as it was. Replacing it with an
       empty one would throw away whatever the diner was holding, just to tell
       them a reorder found nothing. */
    if (rebuilt.length) {
      setKitchenId(order.kitchenId);
      setCouponCode(null);
      setLines(rebuilt);
    }
    return { ok: rebuilt.length > 0, dropped: order.lines.length - rebuilt.length };
  }, [isSignedIn, loadMenu]);

  /*
   * One order in flight at a time. A REF and not state: two clicks in the same
   * tick both read `false` out of state, and the second would place a second
   * order - a second real order, told to a real kitchen. The ref changes
   * synchronously, so the second click sees it.
   */
  const placing = useRef(false);

  /**
   * Place it.
   *
   * Cash on delivery, or pickup paid at the counter - see the header for why not
   * cards. Answers one of
   *
   *   { ok: true, order, notified }   placed. `order.orderNumber` is the
   *                                   reference from here on; `notified` is the
   *                                   server saying whether the kitchen was
   *                                   actually reached.
   *   { authRequired: true }          no session. Refused HERE, as well as on the
   *                                   checkout page, because this is the function
   *                                   that creates the order and a button
   *                                   somewhere else may one day forget to look.
   *   { error }                       refused, or unreachable. `error.message` is
   *                                   a sentence written for the diner and
   *                                   `error.code` says which
   *                                   (RESTAURANT_CLOSED, DISH_SOLD_OUT,
   *                                   BELOW_MINIMUM, ...). The cart is left
   *                                   exactly as it was, so they can fix it and
   *                                   try again.
   *
   * The cart is emptied ONLY on success. Emptying it first would turn a
   * refusal - a dish that just sold out - into a diner who has lost their whole
   * order and must rebuild it from memory.
   *
   * The price is never sent. The server reads it off the dish, which is why a
   * total that changed between this screen and the receipt is the server
   * being right, not a bug here.
   */
  const placeOrder = useCallback(async ({ instructions = '' } = {}) => {
    if (!isSignedIn) return { authRequired: true };
    if (placing.current) return { error: problem('Your order is already being placed.', 'IN_FLIGHT') };
    if (!kitchenId || !lines.length) return { error: problem('There is nothing in your cart.', 'EMPTY_CART') };

    const delivering = fulfilment === 'delivery';
    if (delivering && !address) {
      return { error: problem('Choose where the rider should come.', 'NO_ADDRESS') };
    }

    /* The door, in words. The order has one address field, so the rider's
       directions ride on the end of it in brackets rather than being lost. */
    const where = delivering
      ? `${[address.title, address.detail].filter(Boolean).join(' - ')}${instructions.trim() ? ` (${instructions.trim()})` : ''}`
      : '';

    placing.current = true;
    try {
      const reply = await placeFoodOrder({
        restaurantId: kitchenId,
        lines: lines.map(l => ({
          productId: l.dishId,
          quantity: l.qty,
          /* By NAME, as the server matches them: it looks each up on the dish
             and ignores one the kitchen does not offer. */
          addOns: (l.addOns || []).map(a => ({ name: a.label })),
          note: [l.spice && l.spice !== 'none' ? SPICE_LABEL[l.spice] : null, l.note].filter(Boolean).join(' · '),
        })),
        paymentMode: 'cod',
        fulfilment,
        /* Says this order came from the WEBSITE. It is what makes the restaurant
           choose who delivers it (its own person, or a Lampose driver) and the
           diner confirm the delivery with a button; an order that does not say so
           is the app's, and gets a real driver found for it. */
        channel: 'web',
        ...(delivering ? { deliveryAddress: where } : {}),
        /* The point, when the address has one - only ever as two named numbers.
           Left out (not sent as null) when there is none: the server reads a
           missing pin as "no location", and would read a 0 as the middle of the
           Atlantic. */
        ...(delivering && Number.isFinite(address.lat) && Number.isFinite(address.lng)
          ? { dropLat: address.lat, dropLng: address.lng }
          : {}),
        customerName: (user && user.name) || '',
      });

      setLines([]);
      setCouponCode(null);
      /* The banner on every food page and the orders list both read the history
         - fetched again so the order that now exists is in it. */
      loadHistory();

      return { ok: true, order: reply.data, notified: reply.notified === true };
    } catch (error) {
      return { error };
    } finally {
      placing.current = false;
    }
  }, [isSignedIn, kitchenId, lines, fulfilment, address, user, loadHistory]);

  /* The diner's orders, from the server - and nothing else. There is no second
     list of "orders placed in this tab": an order either exists on the server
     or it does not exist. */
  const orders = history;

  const value = useMemo(() => ({
    kitchenId, kitchen, lines, bill, coupon, fulfilment, address, addressId, payment,
    orders, addresses, coupons,
    ordersLoading: historyLoading, refreshOrders: loadHistory,
    add, setQty, remove, clear, applyCoupon, removeCoupon, reorder,
    setFulfilment, setAddressId, setPayment, placeOrder,
  }), [
    kitchenId, kitchen, lines, bill, coupon, fulfilment, address, addressId, payment,
    orders, addresses, coupons, historyLoading, loadHistory,
    add, setQty, remove, clear, applyCoupon, removeCoupon, reorder, placeOrder,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * The cart, from anywhere on the site.
 *
 * Throws outside the provider for the same reason `useAuth` does: a
 * component reading it outside the tree is a wiring mistake, and a null
 * handed back quietly would draw an empty cart forever.
 */
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside <CartProvider>');
  return value;
}

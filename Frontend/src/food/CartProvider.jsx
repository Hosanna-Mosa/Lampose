import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ADDRESSES, DISHES, ORDERS, kitchenById, dishById, readyLabel,
} from '../data/food';
import { couponBlockedReason, couponByCode, lineUnitPrice, totals } from './cart';

/* ══════════════════════════════════════════════════════════════════════════
   The food order, for the whole site.

   ## This is a mock, and it says so in one place

   Nothing in here calls the API. The catalogue comes from `data/food.js` and
   a placed order is pushed onto a list in memory, because the ordering
   surface was designed and built before it was wired up. Everything a real
   implementation would need is already shaped the way the backend shapes it
   (`food_orders`: a kitchen `status` beside a rider `dispatch`), so wiring it
   up later replaces this file's four writers — `add`, `applyCoupon`,
   `placeOrder`, `cancel` — and leaves every screen alone.

   Held in `sessionStorage`, and deliberately not in `localStorage`: a cart
   and a just-placed order have to survive a reload — refreshing the tracking
   page is the first thing anybody does to it — but they must not outlive the
   tab. A cart in localStorage is still there next week, priced from a fixture
   that has since been edited, and then it disagrees with the menu it came
   from. Closing the tab is the reset.

   Every read and write is wrapped: a private window, blocked site data or a
   half-written entry all fall back to the seed rather than throwing on the
   first render.

   ## One cart, one kitchen

   A cart carries dishes from a single kitchen, because an order is a ticket
   printed at one counter and a rider collects from one door. Adding from
   somewhere else does not silently clear the cart: `add` refuses and hands
   back the conflict, and the kitchen page asks before throwing the food away.

   ## The seed

   The cart starts with the two dishes the designs were drawn around, so the
   pages open on the state they were designed in rather than on six empty
   states. `clear()` empties it and every empty state is reachable from there.
   ══════════════════════════════════════════════════════════════════════════ */

const CartContext = createContext(null);

/* Bumped when the shape below changes, so a tab holding yesterday's shape
   starts again instead of rendering half a cart. */
const STORE_KEY = 'lampose.food.mock.v1';

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

/* The two lines the mockups show, built through the same code path an ADD
   would take so the seed cannot drift from what the sheet produces. */
function seedLines() {
  const thali = dishById('am-thali');
  const curdRice = dishById('am-curd-rice');
  const extraCurd = thali.addOns.find(a => a.id === 'curd');
  return [
    {
      uid: nextUid(),
      dishId: thali.id,
      name: thali.name,
      diet: thali.diet,
      basePrice: thali.price,
      addOns: [extraCurd],
      spice: 'medium',
      note: 'Pack the curd separately',
      qty: 1,
      unitPrice: lineUnitPrice(thali, [extraCurd]),
    },
    {
      uid: nextUid(),
      dishId: curdRice.id,
      name: curdRice.name,
      diet: curdRice.diet,
      basePrice: curdRice.price,
      addOns: [],
      spice: null,
      note: '',
      qty: 1,
      unitPrice: lineUnitPrice(curdRice, []),
    },
  ];
}

export function CartProvider({ children }) {
  /* Read once, at the first render: the stored cart if this tab has one, the
     designed seed if it does not. */
  const [saved] = useState(readStore);

  const [kitchenId, setKitchenId] = useState(saved ? saved.kitchenId : 'annapurna-mess');
  const [lines, setLines] = useState(() => (saved ? saved.lines : seedLines()));
  const [couponCode, setCouponCode] = useState(saved ? saved.couponCode : 'MESS20');
  const [fulfilment, setFulfilment] = useState(saved?.fulfilment || 'delivery');
  const [addressId, setAddressId] = useState(
    saved?.addressId || ADDRESSES.find(a => a.isDefault)?.id || ADDRESSES[0].id,
  );
  const [payment, setPayment] = useState(saved?.payment || 'upi');

  /* Orders placed in this tab, newest first, in front of the fixtures. */
  const [placed, setPlaced] = useState(() => saved?.placed || []);

  /* A line's uid has to stay unique across a reload, or the next ADD collides
     with a restored line and steps the wrong row. */
  useState(() => {
    const restored = (saved?.lines || []).map(l => Number(String(l.uid).split('-')[1]) || 0);
    seq = Math.max(seq, ...restored, 0);
  });

  useEffect(() => {
    writeStore({ kitchenId, lines, couponCode, fulfilment, addressId, payment, placed });
  }, [kitchenId, lines, couponCode, fulfilment, addressId, payment, placed]);

  const kitchen = kitchenId ? kitchenById(kitchenId) : null;
  const coupon = couponCode ? couponByCode(couponCode) : null;
  const address = ADDRESSES.find(a => a.id === addressId) || null;

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
  }, [kitchenId, lines.length]);

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
    const found = couponByCode(code);
    if (!found) return { error: 'No offer with that code' };
    const blocked = couponBlockedReason(found, {
      itemTotal: bill.itemTotal, kitchenId, fulfilment,
    });
    if (blocked) return { error: blocked };
    setCouponCode(found.code);
    return { ok: true };
  }, [bill.itemTotal, kitchenId, fulfilment]);

  const removeCoupon = useCallback(() => setCouponCode(null), []);

  /* Rebuild a past order's cart at TODAY's prices — the receipt keeps what
     was charged then, and a reorder that re-charged last month's price would
     be quoting a number the kitchen never agreed to. */
  const reorder = useCallback(order => {
    const rebuilt = order.lines
      .map(l => {
        const dish = DISHES.find(d => d.kitchenId === order.kitchenId && d.name === l.name);
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

    setKitchenId(order.kitchenId);
    setCouponCode(null);
    setLines(rebuilt);
    return { ok: rebuilt.length > 0, dropped: order.lines.length - rebuilt.length };
  }, []);

  /**
   * Place it. Mock: no network, no payment, no signature to verify.
   *
   * The order it writes still carries `paymentStatus`, because the tracking
   * page reads it — an online order is 'paid' here only because there is
   * nothing to fail. In the wired-up version that word may only ever come
   * back from a verified Razorpay signature.
   */
  const placeOrder = useCallback(() => {
    const reference = `LMP-${4832 + placed.length}`;
    const order = {
      reference,
      kitchenId,
      kitchenName: kitchen?.name || '',
      live: true,
      status: 'placed',
      statusLabel: 'Sent to the kitchen',
      fulfilment,
      placedLabel: `Today, ${readyLabel(0)}`,
      monthLabel: 'September 2026',
      addressTitle: fulfilment === 'delivery' ? address?.title : 'Collecting it yourself',
      lines: lines.map(l => ({
        name: l.name,
        qty: l.qty,
        price: l.unitPrice,
        diet: l.diet,
        note: [l.spice, ...(l.addOns || []).map(a => a.label), l.note].filter(Boolean).join(' · '),
      })),
      itemTotal: bill.itemTotal,
      packagingCharge: bill.packagingCharge,
      deliveryFee: bill.deliveryFee,
      discount: bill.discount,
      couponCode: bill.discount ? coupon?.code : undefined,
      paid: payment === 'cod' ? 0 : bill.toPay,
      dueOnDelivery: payment === 'cod' ? bill.toPay : 0,
      paymentLabel: payment === 'cod' ? 'Cash on delivery' : payment === 'card' ? 'Card · paid' : 'UPI · paid',
      paymentStatus: payment === 'cod' ? 'pending' : 'paid',
      deliveryOtp: fulfilment === 'delivery' ? '4827' : undefined,
      pickupCode: fulfilment === 'pickup' ? '3390' : undefined,
      etaLabel: readyLabel(fulfilment === 'delivery' ? kitchen.deliveryMinutes : kitchen.prepMinutes),
      distanceLabel: '1.4 km',
      lastFixLabel: 'just now',
      dispatch: { state: fulfilment === 'delivery' ? 'searching' : 'idle', candidateCount: 3 },
      rider: null,
      kitchenTrack: [
        { label: 'Order placed', at: readyLabel(0), note: payment === 'cod' ? 'Cash on delivery' : 'Payment confirmed', done: true },
        { label: 'Waiting for the kitchen to accept', current: true },
        { label: 'Cooking' },
        { label: 'Ready & packed', note: `About ${kitchen.prepMinutes} minutes` },
      ],
      riderTrack: fulfilment === 'delivery' ? [
        { label: 'Looking for a rider', note: 'Riders nearby are being asked', current: true },
        { label: 'Rider accepts' },
        { label: 'Picked up · on the way' },
        { label: 'Handed over', note: 'Needs code 4827' },
      ] : null,
    };

    setPlaced(prev => [order, ...prev]);
    setLines([]);
    setCouponCode(null);
    return order;
  }, [address, bill, coupon, fulfilment, kitchen, kitchenId, lines, payment, placed.length]);

  /* Every order this site can show: what was placed just now, then the
     fixtures. The tracking page looks a reference up in here. */
  const orders = useMemo(() => [...placed, ...ORDERS], [placed]);

  const cancel = useCallback(reference => {
    setPlaced(prev => prev.map(o => (o.reference === reference
      ? {
        ...o,
        live: false,
        status: 'cancelled',
        statusLabel: 'You cancelled',
        cancelNote: 'Cancelled before the kitchen accepted · nothing was charged',
        paid: 0,
        rider: null,
        dispatch: { state: 'idle' },
      }
      : o)));
  }, []);

  const value = useMemo(() => ({
    kitchenId, kitchen, lines, bill, coupon, fulfilment, address, addressId, payment,
    orders, placed,
    add, setQty, remove, clear, applyCoupon, removeCoupon, reorder,
    setFulfilment, setAddressId, setPayment, placeOrder, cancel,
  }), [
    kitchenId, kitchen, lines, bill, coupon, fulfilment, address, addressId, payment,
    orders, placed,
    add, setQty, remove, clear, applyCoupon, removeCoupon, reorder, placeOrder, cancel,
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

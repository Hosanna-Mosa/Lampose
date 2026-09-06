/* ══════════════════════════════════════════════════════════════════════════
   The thing that notices a new order, wherever the kitchen is looking.

   A direct port of the Driver app's `startOfferPump`, and it exists for the
   same reason that one does — stated there as: "started once, here, for the
   life of the app rather than per screen. An offer must be able to arrive
   while the rider is looking at their earnings."

   ## The bug this fixes

   All three alert paths used to live inside `(dash)/orders.tsx`: the socket
   listener, the twenty-second poll, and the chime. React Navigation mounts a
   tab LAZILY — the Orders screen does not exist until somebody taps it — so a
   kitchen that opened the app onto Home and left it there had no socket, no
   poll and no sound. The one case this whole feature is for, a tablet sitting
   face-up on a counter, was the case it did not cover.

   So the pump is started from `app/_layout.tsx` the moment there is a session,
   and it outlives every screen.

   ## Two transports, one alert

   `order_placed` over the socket is instant. The poll is what still works when
   the socket server is down, the token is stale or the network dropped it.
   Both funnel into `announce`, which is idempotent on the order count for the
   same reason the rider's `receiveOffer` is idempotent on the order number:
   getting both is one new order, not two chimes.

   ## An order can also go AWAY

   `dispatch_update` is the same fan-out the diner's tracking screen and the
   rider's job screen ride, and the kitchen is one of its audiences: the server
   sends it on every cancellation and every rider event for this restaurant.
   Without it a diner cancelling an order the kitchen had already accepted was
   invisible here — the poll only counts what is still `placed`, so an accepted
   order disappearing moved no counter and the ticket simply left the list
   between two refreshes, mid-service, with the food on the pass.

   It makes no noise. The chime means "a new order"; a second use of the same
   sound for the opposite event is worse than silence, so a cancellation
   refreshes the queue and leaves a message on it instead.

   ## Screens subscribe; they do not own it

   `onNewOrder` hands a screen a callback and an unsubscribe. The Orders list
   uses it to refresh itself. Nothing about the ALERT depends on that screen
   being mounted, which is the whole point.
   ══════════════════════════════════════════════════════════════════════════ */
import { AppState } from "react-native";

import { playNewOrderAlert } from "./alertSound";
import {
  connectOrderSocket,
  disconnectOrderSocket,
  onDispatchUpdate,
  onOrderPlaced,
  onUnauthorised,
} from "./orderSocket";
import { ApiError } from "./api";
import { listMyOrders } from "./foodPartner";

/** How often the fallback asks. The same twenty seconds the screen used. */
const POLL_MS = 20_000;

type Listener = () => void;

/*
 * TWO channels, because "the queue changed" and "an order arrived" are not the
 * same event and the second is much louder.
 *
 * The first version had one. The poll notifies whenever the waiting count
 * MOVES, which includes it going DOWN — an order accepted on the other handset
 * behind the counter, or a diner cancelling. With one channel that fired the
 * chime and slid the new-order sheet up in response to an order being taken
 * away, which is the opposite of what either is for.
 *
 *   arrivals  something new is waiting. Rings, and shows the sheet.
 *   changes   the queue is different from a moment ago. Refresh, silently.
 *   expiries  the session this pump was started with is no longer accepted.
 */
const arrivals = new Set<Listener>();
const changes = new Set<Listener>();
const expiries = new Set<Listener>();

/**
 * The order that most recently ARRIVED, as opposed to the one on screen.
 *
 * Held here rather than passed to listeners because the two transports know
 * different amounts: the socket carries the order number, the poll only knows
 * the count went up. The sheet fetches the newest `placed` order either way —
 * this is only so it can tell "the one I was opened for" from "another one
 * that landed while I was open".
 */
let arrivedOrderNumber: string | null = null;

/** What the sheet was opened for, if the socket happened to say. */
export const lastArrival = () => arrivedOrderNumber;

/**
 * Orders the diner cancelled while the kitchen was working on them.
 *
 * Held here rather than handed to the `changes` listeners because the Orders
 * screen is not necessarily mounted when the cancellation lands — a kitchen
 * looking at its menu still has to be told when it comes back that the ticket
 * it was cooking is gone, and a callback fired at nobody would lose that.
 *
 * The list is the screen's to clear: it is read when the queue refreshes and
 * emptied when somebody acknowledges the message, which is the only proof we
 * have that the counter actually saw it.
 */
let takenAway: string[] = [];
export const cancelledOrders = () => takenAway;
export const clearCancelledOrders = () => { takenAway = []; };

/**
 * Whether the new-order sheet is currently up.
 *
 * Lives here rather than in the layout because the SHEET is what knows — it
 * sets this on mount and clears it on unmount, so the flag is released
 * whichever way the sheet left. A boolean in the layout could only be cleared
 * by the layout, which never learns that somebody swiped the sheet away.
 */
let sheetShowing = false;
export const setSheetOpen = (open: boolean) => { sheetShowing = open; };
export const isSheetOpen = () => sheetShowing;

/**
 * Orders the kitchen has already been shown the intimation for, and closed
 * with its own "Okay" — not accepted, not rejected, just acknowledged.
 *
 * The sheet is a heads-up now, not a decision: accepting and rejecting both
 * happen on the Orders tab, which already carries that whole exchange per
 * card. Without this, an order closed here would still be `placed` the next
 * time the sheet reloads — another order arriving, or the pump re-announcing
 * — and would slide back up as if it had never been seen.
 *
 * Held here rather than in the sheet itself so it survives the sheet being
 * torn down and rebuilt for the next arrival, and cleared with everything
 * else when a session ends, so the next partner to sign in on this handset
 * does not inherit somebody else's dismissed tickets.
 */
const acknowledged = new Set<string>();
export const acknowledgeOrder = (orderNumber: string | null | undefined) => {
  if (orderNumber) acknowledged.add(orderNumber);
};
export const isAcknowledged = (orderNumber: string) => acknowledged.has(orderNumber);

/**
 * How many orders were waiting last time we looked.
 *
 * `null` means "we have not looked yet", which is deliberately different from
 * zero: the FIRST reading must not ring. A kitchen opening the app to three
 * orders placed overnight does not want three chimes for news it already has.
 */
let lastPlaced: number | null = null;

/**
 * Everything the kitchen is holding, by the same "not looked yet" rule.
 *
 * The four statuses a restaurant still owns work. Tracked beside the waiting
 * count so the poll notices an order LEAVING the kitchen as well as joining
 * it: a cancellation never touches `placed`, and a queue that quietly loses a
 * ticket between two refreshes is the whole of what a counter would see.
 */
const WORKING = ["placed", "accepted", "preparing", "ready"];
let lastWorking: number | null = null;
let stopped = true;

/** Run a set of listeners without letting one failure stop the rest. */
const fire = (set: Set<Listener>) => {
  set.forEach((listener) => {
    try {
      listener();
    } catch {
      /* A screen that throws in its refresh must not stop the others, and
         must not stop the pump. */
    }
  });
};

/**
 * Ring once, and tell the screens.
 *
 * Called by both transports. The alert itself is fire-and-forget — a chime
 * that cannot play (no audio module in this build) falls back to a local
 * notification inside `playNewOrderAlert`, and neither failure is worth
 * surfacing over a queue that is about to refresh anyway.
 */
const announce = (orderNumber?: string) => {
  if (orderNumber) arrivedOrderNumber = orderNumber;

  /*
   * The announced order is COUNTED here, and that is what makes the header's
   * "one alert" true.
   *
   * The socket fires within a second of the order being written. The poll then
   * reads a `placed` count one higher than the last one it recorded and, with
   * nothing written here, rings for the very same ticket up to twenty seconds
   * later — every order chimed twice. The socket cannot say what the new total
   * is, only that there is one more, so one more is what is recorded; the next
   * poll replaces that projection with the number it actually read.
   *
   * A null `lastPlaced` stays null. It means "no baseline yet", and the first
   * reading deliberately never rings — a kitchen opening the app to three
   * orders placed overnight does not want three chimes for news it has.
   */
  if (lastPlaced !== null) lastPlaced += 1;

  void playNewOrderAlert();
  /* Arrivals first, then the quiet refresh — a screen already showing the
     queue should redraw whether or not anything popped over it. */
  fire(arrivals);
  fire(changes);
};

/**
 * Something NEW is waiting. Rings and shows the sheet.
 *
 * Deliberately not fired when the count falls: an order accepted on another
 * handset is a change, not an arrival.
 */
export function onNewOrder(listener: Listener): () => void {
  arrivals.add(listener);
  return () => {
    arrivals.delete(listener);
  };
}

/** The queue is different. Refresh a list; make no noise. */
export function onQueueChanged(listener: Listener): () => void {
  changes.add(listener);
  return () => {
    changes.delete(listener);
  };
}

/**
 * This session is no longer accepted anywhere.
 *
 * A partner token lasts a week and then simply stops working, and both
 * transports fail at that point in a way that says nothing: the realtime
 * server emits `unauthorised` and hangs the socket up itself — which
 * socket.io does NOT reconnect from, unlike every other kind of drop — and the
 * poll gets a 401 that used to be swallowed with the flaky-network case. The
 * tablet went quiet with a stale list on screen and no reason for it, which is
 * the one thing this feature may never do.
 *
 * So both funnel here, and the root layout turns it into a signed-out state.
 * A refused token is the only thing that fires this: a network failure carries
 * status 0 and is genuinely not news.
 */
export function onSessionExpired(listener: Listener): () => void {
  expiries.add(listener);
  return () => {
    expiries.delete(listener);
  };
}

/*
 * Once per outage, not once per tick.
 *
 * The poll keeps running until the layout has torn the pump down, and the
 * socket can hang up while a poll is already in flight, so without this a
 * single expiry would ask the app to sign out several times over.
 */
let expired = false;
const expire = () => {
  if (expired || stopped) return;
  expired = true;
  fire(expiries);
};

/**
 * Start watching. Returns a stop function.
 *
 * Called from the root layout with the partner's session. Safe to call again —
 * the socket connection is idempotent on the token, and the interval is
 * replaced rather than doubled.
 */
export function startOrderPump(token: string): () => void {
  stopped = false;
  expired = false;
  lastPlaced = null;
  lastWorking = null;

  connectOrderSocket(token);
  const offSocket = onOrderPlaced((order) => {
    if (stopped) return;
    announce(order?.orderNumber);
  });

  /*
   * Everything that happens to an order after the kitchen accepted it.
   *
   * Mostly rider news — searching, assigned, collected — and a refresh is the
   * whole response to those: the card grows a rider's name and number without
   * waiting for the next poll. A cancellation is the one that has to be SAID,
   * because the row does not change on the card, it leaves it: the poll counts
   * `placed` orders only, so an accepted order being cancelled moves no
   * counter and would otherwise be a ticket vanishing between two refreshes.
   */
  const offDispatch = onDispatchUpdate((update) => {
    if (stopped) return;
    if (update?.status === "cancelled" && update.orderNumber && !takenAway.includes(update.orderNumber)) {
      takenAway = [...takenAway, update.orderNumber];
    }
    fire(changes);
  });

  /* The realtime server's own word for a token it will not accept. It hangs
     the socket up immediately afterwards and socket.io does not reconnect from
     a server-side disconnect, so this is the last thing this connection will
     ever say. */
  const offUnauthorised = onUnauthorised(() => expire());

  const timer = setInterval(async () => {
    /* Only while the app is in front. A backgrounded app is the push
       notification's job, and polling from the background is what gets an app
       killed by Android. */
    if (stopped || AppState.currentState !== "active") return;
    try {
      const page = await listMyOrders(token, "placed");
      const waiting = page.counts.placed ?? 0;
      /* The tally the server returns covers every status, not just the one
         asked for, so this costs no second request. `placed` alone is blind to
         everything that happens to an order AFTER the kitchen takes it — a
         diner cancelling an accepted order moved no counter here at all — and
         the poll is precisely the path that has to keep working when the
         socket is down. The whole of what the kitchen is holding is what it
         watches. */
      const working = WORKING.reduce((total, status) => total + (page.counts[status] ?? 0), 0);

      /* A RISE, not a non-zero. An order the kitchen has already accepted
         leaves `placed`, so this only moves when something genuinely new is
         waiting — and the first reading only records, it does not ring. */
      /* A RISE is an arrival. Any other move — including the FIRST reading,
         where `lastPlaced` is still null — is only a change: a kitchen opening
         the app to two orders placed overnight must not be handed a sheet for
         news it already has. */
      if (lastPlaced !== null && waiting > lastPlaced) announce();
      else if (lastPlaced !== waiting || (lastWorking !== null && lastWorking !== working)) {
        fire(changes);
      }

      lastPlaced = waiting;
      lastWorking = working;
    } catch (err) {
      /* A flaky poll is not news. The socket and the next tick both stand.
         A REFUSED one is: 401 is the server saying this session has run out,
         and every later tick would fail the same way in the same silence. */
      if (err instanceof ApiError && err.status === 401) expire();
    }
  }, POLL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
    offSocket();
    offDispatch();
    offUnauthorised();
    disconnectOrderSocket();
    lastPlaced = null;
    lastWorking = null;
    arrivedOrderNumber = null;
    takenAway = [];
    acknowledged.clear();
  };
}

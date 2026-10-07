/* ══════════════════════════════════════════════════════════════════════════
   The thing that notices a table request, wherever the kitchen is looking.

   `orderPump.ts` for dine-in, started beside it from the root layout and for
   the reason given there: React Navigation mounts a tab lazily, so an alert
   that lived on the Orders screen would be silent for a kitchen sitting on
   Home. A table request expires if nobody answers it in fifteen minutes, which
   puts it in the same class as an order.

   ## Two transports, one chime

   `table_booking_requested` over the socket is instant. The poll is what still
   works when the socket is down. Both ring through `announce`, which is
   idempotent on the booking reference — getting both is one request, not two
   chimes.

   The chime is the ORDER chime, on purpose. The server sends the table push
   on the order channel too, and a counter should not have to learn a second
   sound for "somebody wants something from you, now".

   ## The poll only runs where dine-in is on

   Most kitchens will never switch it on, and a request every twenty seconds
   for a list that is always empty buys nothing. The pump asks once when it
   starts, asks again every few minutes while the answer is "off", and the
   settings screen tells it the moment that changes. A request arriving over
   the socket proves it is on, whatever it was last told.

   ## Screens subscribe; they do not own it

   The toast listens for arrivals, the Dine-in tab for the waiting count, the
   table list for changes. Nothing about the ALERT depends on any of them
   being mounted.
   ══════════════════════════════════════════════════════════════════════════ */
import { AppState } from "react-native";

import { playNewOrderAlert } from "./alertSound";
import {
  getDineInSettings,
  listTableBookings,
  onTableBookingRequested,
  onTableBookingUpdated,
  type TableBookingEvent,
} from "./dineIn";

/** The same twenty seconds the order pump uses. */
const POLL_MS = 20_000;

/** How long an "off" answer is trusted before asking again. */
const RECHECK_OFF_MS = 5 * 60_000;

/** What a new request rang for — the socket knows who, the poll only how many. */
export type TableArrival = { count: number; latest: TableBookingEvent | null };

/*
 * Three channels, because they are three different events:
 *
 *   arrivals  something new is waiting. Rings, and shows the toast.
 *   changes   a booking moved. Refresh a list, silently.
 *   counts    how many requests are waiting. The Dine-in tab's badge.
 */
const arrivals = new Set<(arrival: TableArrival) => void>();
const changes = new Set<(value: void) => void>();
const counts = new Set<(waiting: number) => void>();

let stopped = true;
/* Which start this is. A poll still in flight when the session changes must
   not land in the next restaurant's pump — `stopped` alone is false again by
   then. */
let generation = 0;
let pumpStartedAt = 0;
let polledOnce = false;

/** Requests already rung for (or already known about), by reference. */
const seen = new Set<string>();

/** Whether this restaurant takes bookings. `null` until somebody has asked. */
let dineInOn: boolean | null = null;
let checkedAt = 0;

/** Requests waiting for an answer, as last read. */
let waiting = 0;

/** Run a set of listeners without letting one failure stop the rest. */
const fire = <T>(set: Set<(value: T) => void>, value: T) => {
  set.forEach((listener) => {
    try {
      listener(value);
    } catch {
      /* A screen that throws in its refresh must not stop the pump. */
    }
  });
};

const setWaiting = (next: number) => {
  const clamped = Math.max(0, next);
  if (clamped === waiting) return;
  waiting = clamped;
  fire(counts, waiting);
};

/** Ring once, show the toast, refresh whatever list is open. */
const announce = (count: number, latest: TableBookingEvent | null) => {
  void playNewOrderAlert({
    title: "New table request",
    body: "A diner wants to book a table. Answer within 15 minutes.",
    kind: "table_booking_local",
  });
  fire(arrivals, { count, latest });
  fire(changes, undefined);
};

/* ── What screens read ────────────────────────────────────────────────── */

/** How many requests are waiting, as last read — for a badge's first frame. */
export const pendingTableRequests = () => waiting;

/** A screen that has just read the list itself, reporting what it saw. */
export const noteTableRequests = (count: number) => setWaiting(count);

/** The settings screen, after a load or a save. Starts or stops the poll. */
export const setDineInOn = (on: boolean) => {
  dineInOn = on;
  checkedAt = Date.now();
};

export function onTableRequest(listener: (arrival: TableArrival) => void): () => void {
  arrivals.add(listener);
  return () => {
    arrivals.delete(listener);
  };
}

export function onTablesChanged(listener: () => void): () => void {
  changes.add(listener);
  return () => {
    changes.delete(listener);
  };
}

export function onTableCount(listener: (waiting: number) => void): () => void {
  counts.add(listener);
  return () => {
    counts.delete(listener);
  };
}

/**
 * A table PUSH that arrived with the app open.
 *
 * True means "the pump already rang for this one — show the banner quietly",
 * the same arrangement `ringForPushedOrder` makes for orders. The push carries
 * only a reference, and the same `kind` is used for a new request and for a
 * diner cancelling, so a reference the pump has never seen is left to ring on
 * its own sound: that is either a request whose socket event never came, or a
 * cancellation worth hearing. Either way it is recorded, so the poll does not
 * ring for it a second time.
 */
export function ringForPushedTableBooking(reference: string | undefined): boolean {
  if (stopped) return false;
  fire(changes, undefined);
  if (!reference) return false;
  if (seen.has(reference)) return true;
  seen.add(reference);
  return false;
}

/* ── The pump ─────────────────────────────────────────────────────────── */

/**
 * Start watching. Returns a stop function.
 *
 * Called from the root layout beside `startOrderPump`. The socket itself is
 * the order pump's to open and close — this only subscribes to it, through the
 * registry in `orderSocket.ts` that survives the connection being replaced.
 */
export function startTablePump(token: string): () => void {
  const run = ++generation;
  const live = () => !stopped && run === generation;
  stopped = false;
  polledOnce = false;
  pumpStartedAt = Date.now();
  dineInOn = null;
  checkedAt = 0;

  const offRequested = onTableBookingRequested((event) => {
    if (stopped || !event?.reference) return;
    dineInOn = true;
    if (seen.has(event.reference)) return;
    seen.add(event.reference);
    /* One more than last read. The next poll replaces the projection. */
    setWaiting(waiting + 1);
    announce(1, event);
  });

  /* A diner cancelling, mostly. No noise — a cancellation is not news to ring
     for — but the list and the badge are both stale now. */
  const offUpdated = onTableBookingUpdated(() => {
    if (stopped) return;
    fire(changes, undefined);
  });

  const poll = async () => {
    /* Foreground only. A backgrounded app is the push's job. */
    if (!live() || AppState.currentState !== "active") return;
    try {
      if (dineInOn === false && Date.now() - checkedAt > RECHECK_OFF_MS) dineInOn = null;
      if (dineInOn === null) {
        const settings = await getDineInSettings(token);
        if (!live()) return;
        setDineInOn(settings.enabled);
      }
      if (!dineInOn) return;

      const page = await listTableBookings(token);
      if (!live()) return;
      /* New = a reference not rung for. On the first reading only requests
         made since the app opened (with one poll's grace) count — the ones
         already waiting are news the kitchen has, or will see on the badge. */
      const fresh = page.requests.filter((b) =>
        polledOnce
          ? !seen.has(b.reference)
          : !seen.has(b.reference) && Date.parse(b.createdAt) >= pumpStartedAt - POLL_MS,
      );
      for (const b of page.requests) seen.add(b.reference);
      polledOnce = true;

      const moved = page.counts.requests !== waiting;
      setWaiting(page.counts.requests);
      if (fresh.length) announce(fresh.length, null);
      else if (moved) fire(changes, undefined);
    } catch {
      /* A flaky poll is not news; the socket and the next tick both stand. A
         dead session is reported centrally by `services/api.ts`. */
    }
  };

  /* Once now, so the badge is right from the first frame rather than twenty
     seconds in. It only records — see `fresh` above. */
  void poll();
  const timer = setInterval(() => void poll(), POLL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
    offRequested();
    offUpdated();
    seen.clear();
    polledOnce = false;
    dineInOn = null;
    setWaiting(0);
  };
}

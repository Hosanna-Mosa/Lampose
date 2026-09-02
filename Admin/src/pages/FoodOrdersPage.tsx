/* ══════════════════════════════════════════════════════════════════════════
   Food orders — the desk somebody works when an order has gone wrong.

   Every other food page in this console asks "may this person trade with us".
   This one is opened for the opposite reason: a student is on the phone, an
   order is not moving or a payment is not back, and the question is where the
   order is and where the money is. So the landing view is not a list of every
   order ever placed — it is the orders that NEED A HUMAN, and everything else
   is a filter away from it.

   ## What "needs a human" means, in the server's words

   Three faults, and their deduplicated union:

   · refund owed     — an online order that was cancelled or rejected (or is
                       already marked refunded) with no settled-refund line
                       against it. Somebody's money is still ours.
   · no rider found  — the order is still open and the search for a rider gave
                       up. Food is going cold in a kitchen.
   · stuck           — still open, and older than the server's threshold.
                       Online orders still 'pending' are excluded: those are
                       abandoned checkouts, not faults.

   An order that is both stuck and owed a refund is ONE row of work, which is
   why the badge is smaller than the three numbers added together.

   ## The refund is the dangerous thing on this page, and it is built like it

   It is full-amount and no amount is sent: Razorpay refunds the whole captured
   payment and reports what it returned. So there is no amount field, and this
   page never shows a "will refund ₹X" figure of its own — the only rupee
   figure in the confirmation is the one the gateway recorded TAKING, drawn
   from `payment.amountPaise` and labelled as that. Any number we computed
   ourselves could disagree with what was captured, and that disagreement would
   be settled in a student's bank account. It is printed by `rupeesFromPaise`
   rather than by `rupees`, to the paisa: the summary formatter renders 32050
   paise as "₹320.5", and a figure on a sheet that authorises a payment is not
   a description of the amount, it IS the amount.

   Three guards sit on the button. It is only rendered for Super Admin and
   Admin, because the roles that approve kitchens and answer tickets are not
   the roles that sign for a payment — the same pair `foodOrderAdmin.routes.js`
   allows, which is the real gate. It asks first, naming the diner. And the
   third is the latch below.

   ## The latch belongs to the ORDER, not to the drawer

   `attempts` is a map keyed by order number, and nothing about opening or
   closing the panel touches it. That is the whole point: a refund POST can
   still be in the air after somebody has closed the drawer and reopened the
   same order — fifteen seconds is a long time with a student on the phone —
   and a latch that lived with the drawer would hand them an armed button while
   their own first request was still travelling.

   It cannot be derived from the order either. In the `recorded: false` shape
   the money moved and the save did not, so the server's copy of that order is
   exactly the evidence that never got written; asking it whether a refund
   happened gets "no" from a row that is owed one.

   So three outcomes are remembered per order, for as long as this page is open:

   · sending  — a request is in the air. Neither control fires, whichever order
                the drawer happens to be showing.
   · spent    — an answer came back that ends the question: any 200 (money
                moved, recorded or not), or a refusal that leaves nothing to
                retry. The red button does not come back for that order.
   · unknown  — no answer came back AT ALL. That is not a failure. A refund
                slower than the client's fifteen seconds, or an answer lost on
                the way home, leaves the money in exactly the state a success
                does — so the page says the outcome is unknown, asks for a
                reload, and offers a second attempt only afterwards and only as
                a deliberate one.

   A refusal that leaves the order genuinely untouched — the gateway said no, a
   key is not configured — is forgotten instead, because there a retry is a
   real retry.

   ## A warning that hides the thing it tells you to do is not a warning

   The `recorded: false` warning ends "Record refund rfnd_… against LO… by
   hand", and the control that does precisely that is on this panel. So a
   notice is a banner ABOVE the controls rather than something rendered instead
   of them, the record form is opened, and the reference the gateway gave is
   already in the box.

   ## Two refunds, never confused with each other

   Sending money and writing down that money was already sent are different
   acts with the same outcome in the queue, so they are different panels: one
   framed in red and phrased as an action, one framed plainly and phrased as a
   record. The second exists because people have been refunding in the Razorpay
   dashboard for as long as there was no button here, and without a way to say
   so the queue would never empty.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ElementType } from 'react';
import {
  Bike,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  HandCoins,
  History,
  MapPin,
  PackageCheck,
  Phone,
  ReceiptIndianRupee,
  RefreshCw,
  ShieldCheck,
  Store,
  Timer,
  TriangleAlert,
  Truck,
  Undo2,
  User,
  UtensilsCrossed,
  XCircle,
} from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  DataRow,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  TableSkeleton,
  Td,
  Textarea,
  Th,
  Toast,
  Tr,
  cx,
  type BadgeTone,
  type ToastState,
} from '../components/ui';
import {
  FOOD_DISPATCH_STATES,
  FOOD_ORDER_OPEN_STATUSES,
  FOOD_ORDER_STATUSES,
  FOOD_PAYMENT_STATUSES,
  foodOrderService,
} from '../api/services/foodOrderService';
import { useAuth } from '../context/AuthContext';
import { useDebounced, useFetch } from '../lib/useFetch';
import { formatDateTime, relativeTime, rupees, rupeesFromPaise } from '../lib/format';
import type {
  FoodDispatchOfferOutcome,
  FoodDispatchState,
  FoodOrderCounts,
  FoodOrderDetail,
  FoodOrderNeeds,
  FoodOrderPaymentMode,
  FoodOrderPaymentStatus,
  FoodOrderQuery,
  FoodOrderRow,
  FoodOrderStatus,
  FoodRefundCode,
} from '../api/types';

interface FoodOrdersPageProps {
  /** The header's filter box. `AdminLayout` names this tab, so it is on. */
  search: string;
  /**
   * The strip of numbers above the queue — and the sidebar's badge, because
   * they are one fetch. App owns it and hands it down rather than this page
   * keeping a second copy: two readings of one fact, three feet apart on the
   * same screen, is how the badge used to sit on yesterday's number until
   * somebody changed tab.
   */
  counts: FoodOrderCounts | null;
  /** Reload those counts — the badge moves with this page's own refresh. */
  reloadCounts: () => void;
}

/* ------------------------------------------------------------------ *
 * Vocabulary
 * ------------------------------------------------------------------ */

const STATUS_META: Record<FoodOrderStatus, { tone: BadgeTone; icon: ElementType; label: string }> = {
  placed: { tone: 'brand', icon: ReceiptIndianRupee, label: 'Placed' },
  accepted: { tone: 'brand', icon: CheckCircle2, label: 'Accepted' },
  preparing: { tone: 'brand', icon: UtensilsCrossed, label: 'Cooking' },
  ready: { tone: 'warn', icon: PackageCheck, label: 'Ready to collect' },
  picked_up: { tone: 'brand', icon: Bike, label: 'On the way' },
  delivered: { tone: 'good', icon: CheckCircle2, label: 'Delivered' },
  rejected: { tone: 'crit', icon: XCircle, label: 'Rejected' },
  cancelled: { tone: 'neutral', icon: CircleSlash, label: 'Cancelled' },
};

/* "Not paid" rather than "pending": on this screen `pending` almost always
   means a checkout somebody walked away from, and "pending" reads as though
   the money is on its way. */
const PAYMENT_META: Record<FoodOrderPaymentStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: 'neutral', label: 'Not paid' },
  paid: { tone: 'good', label: 'Paid' },
  refunded: { tone: 'brand', label: 'Refunded' },
  failed: { tone: 'crit', label: 'Payment failed' },
};

const DISPATCH_META: Record<FoodDispatchState, { tone: BadgeTone; label: string }> = {
  idle: { tone: 'neutral', label: 'No rider needed yet' },
  searching: { tone: 'warn', label: 'Looking for a rider' },
  assigned: { tone: 'good', label: 'Rider assigned' },
  unassigned: { tone: 'crit', label: 'No rider found' },
};

const OFFER_META: Record<FoodDispatchOfferOutcome, { tone: BadgeTone; label: string }> = {
  offered: { tone: 'neutral', label: 'Asked' },
  accepted: { tone: 'good', label: 'Took it' },
  declined: { tone: 'crit', label: 'Said no' },
  timeout: { tone: 'warn', label: 'No answer' },
  cancelled: { tone: 'neutral', label: 'Withdrawn' },
};

const PAYMENT_MODE_LABEL: Record<FoodOrderPaymentMode, string> = {
  online: 'Online',
  cod: 'Cash on delivery',
};

const VEG_LABEL: Record<string, string> = {
  veg: 'Veg',
  'non-veg': 'Non-veg',
  egg: 'Egg',
};

/**
 * The roles the backend lets refund.
 *
 * Mirrored here only so a button that would 403 is never drawn — the guard in
 * `foodOrderAdmin.routes.js` is the real one. Deliberately NOT the set the
 * restaurant and rider queues use: 'Food Admin' decides who may cook and who
 * may ride, and neither of those is authority to send money out of the
 * company's account.
 */
const REFUNDING_ROLES = new Set(['Super Admin', 'Admin']);

/**
 * Refusals after which the button must not come back.
 *
 * The money has already gone, it was never owed, or a click is still in the
 * air. Everything else — the gateway saying no, a key that is not configured,
 * a network that dropped — leaves the order exactly as it was and the attempt
 * written into its history, so the control stays live and truthful.
 */
const FINAL_CODES = new Set<FoodRefundCode>([
  'ALREADY_REFUNDED',
  'NOT_OWED',
  'NO_PAYMENT_ID',
  'REFUND_IN_FLIGHT',
  'FORBIDDEN',
  'NOT_FOUND',
]);

/* ------------------------------------------------------------------ *
 * Small formatters. Money always goes through `rupees` from lib/format.
 * ------------------------------------------------------------------ */

/** A dash, not a nought, when the figure was never written. */
const money = (value: number | null | undefined): string =>
  (value === null || value === undefined ? '—' : rupees(value));

const dash = (value: string | null | undefined): string => (value ? value : '—');

const when = (iso: string | null | undefined): string => formatDateTime(iso);

/** "12 min", "1 h 14 min" — an operations screen is read in elapsed time. */
const elapsed = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

const metres = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
};

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

type StatusFilter = FoodOrderStatus | 'all' | 'open';

/** What a status filter is on the wire. `open` is five statuses, not one. */
const statusParam = (filter: StatusFilter): FoodOrderQuery['status'] => {
  if (filter === 'all') return 'all';
  if (filter === 'open') return [...FOOD_ORDER_OPEN_STATUSES];
  return filter;
};

interface RefundNotice {
  tone: 'good' | 'warn' | 'crit';
  text: string;
}

/**
 * What is known about the money once nothing is in the air.
 *
 * `unknown` is the one that is easy to get wrong: nothing came back, so the
 * refund may have happened and may not have. It is not a failure and must
 * never be offered a plain retry. See the header.
 */
type RefundOutcome = 'open' | 'spent' | 'unknown';

interface RefundAttempt {
  /**
   * A request for this order is in the air right now. Separate from `outcome`
   * because a manual record can be written FROM an unknown outcome, and losing
   * which state that write started from would put the refund button back on
   * the screen while it was still running.
   */
  sending: boolean;
  /** 'open' only ever appears with `sending` — nothing has come back yet. */
  outcome: RefundOutcome;
  /** Shown as a banner above whatever controls are left. */
  notice: RefundNotice | null;
  /**
   * The money may be gone with nothing written against the order — the one
   * situation in which recording it by hand IS the next action, so the panel
   * keeps that control instead of hiding it behind the warning that names it.
   * True for the `recorded: false` answer and for an unknown outcome.
   */
  recordByHand: boolean;
  /** The reference the server named, so nobody retypes it out of a warning. */
  reference: string;
  /** Set once somebody has reloaded the order after an unknown outcome. */
  rechecked: boolean;
}

/** The blank record every state below is spread from. */
const NEW_ATTEMPT: RefundAttempt = {
  sending: false,
  outcome: 'open',
  notice: null,
  recordByHand: false,
  reference: '',
  rechecked: false,
};

/**
 * May a refund still be written down by hand against this order?
 *
 * Yes when nothing has been attempted, and yes for the two outcomes this is
 * the answer to — the money moved without being recorded, and nobody knows
 * whether it moved. No once the question has been closed some other way.
 */
const canRecordByHand = (attempt?: RefundAttempt): boolean =>
  !attempt || attempt.outcome === 'unknown' || attempt.recordByHand;

/** Nothing more will be sent for this order from this page: the answer, or the
 *  absence of one, has already arrived. */
const isClosed = (attempt?: RefundAttempt): boolean =>
  !!attempt && attempt.outcome !== 'open';

export const FoodOrdersPage: React.FC<FoodOrdersPageProps> = ({
  search,
  counts,
  reloadCounts,
}) => {
  const { user } = useAuth();
  const canRefund = REFUNDING_ROLES.has(user?.role ?? '');

  /* The landing view is the work, not the archive. */
  const [needs, setNeeds] = useState<FoodOrderNeeds | ''>('human');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [paymentStatus, setPaymentStatus] = useState<FoodOrderPaymentStatus | 'all'>('all');
  const [paymentMode, setPaymentMode] = useState<FoodOrderPaymentMode | 'all'>('all');
  const [dispatchState, setDispatchState] = useState<FoodDispatchState | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [openNumber, setOpenNumber] = useState<string | null>(null);
  /* The server's own updated copy after a refund, which outranks the fetched
     one until the drawer is closed. Set from the action's response rather than
     refetched, so the row a person is looking at changes the moment the money
     does. */
  const [patched, setPatched] = useState<FoodOrderDetail | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [settleNote, setSettleNote] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  /*
   * The header's filter box IS this page's search. `AdminLayout` names this tab
   * in `SEARCH_PLACEHOLDERS`, so the box every other record list is worked
   * through is the box here too, and the page no longer carries a second one
   * that meant the same thing in a different place on the screen.
   *
   * Still debounced, because each distinct value is a request to the server and
   * an order number is fourteen keystrokes.
   */
  const q = useDebounced(search.trim(), 300);

  const query: FoodOrderQuery = useMemo(
    () => ({
      needs,
      status: statusParam(status),
      paymentStatus,
      paymentMode,
      dispatchState,
      from,
      to,
      q,
      page,
    }),
    [needs, status, paymentStatus, paymentMode, dispatchState, from, to, q, page]
  );

  const queue = useFetch(() => foodOrderService.list(query), [query]);

  const detail = useFetch<FoodOrderDetail | null>(
    () =>
      openNumber
        ? foodOrderService.get(openNumber)
        : Promise.resolve({ data: null, status: 200, message: '', success: true, timestamp: '' }),
    [openNumber]
  );

  /* A narrowed filter with page 5 still selected returns nothing and reads as
     an empty queue. Any change to what is being asked for goes back to one —
     written as a functional update so that already being on page one is not a
     state change, and does not cost the queue a second request. */
  useEffect(() => {
    setPage((current) => (current === 1 ? current : 1));
  }, [needs, status, paymentStatus, paymentMode, dispatchState, from, to, q]);

  const rows = queue.data?.rows ?? [];
  /* Named for what it is on this screen; owned by App, which draws the same
     numbers as the sidebar badge. */
  const tally: FoodOrderCounts | null = counts;

  /*
   * The detail is shown only when it IS the order that was asked for.
   *
   * `useFetch` deliberately keeps the previous payload on screen while the
   * next one loads, which is right for a table and dangerous here: every
   * action on this panel is sent for `open.orderNumber`, so a stale order
   * under a new heading is how one diner's money goes back against another
   * diner's order. One comparison closes it.
   */
  const loaded = patched ?? detail.data;
  const open =
    loaded && openNumber && loaded.orderNumber.toUpperCase() === openNumber.trim().toUpperCase()
      ? loaded
      : null;

  /*
   * The latch that makes a refund unpressable twice, keyed by ORDER.
   *
   * Two things have to be true of it and neither is true of a flag that lives
   * with the drawer. It has to change SYNCHRONOUSLY, because two clicks inside
   * one tick both read React state as it was before either of them fired — so
   * the check that stops the second one reads the ref, which the first one has
   * already written. And it has to survive the panel closing, because the
   * request outlives the panel: close the drawer on a slow refund, reopen the
   * same order, and a drawer-scoped latch has just re-armed the button on a
   * request that is still in the air. See the header.
   *
   * The state copy is what the panel renders from; the ref is what the guards
   * read. They are only ever written together, by these two helpers.
   */
  const [attempts, setAttempts] = useState<Record<string, RefundAttempt>>({});
  const attemptsRef = useRef<Record<string, RefundAttempt>>({});

  const noteAttempt = (orderNumber: string, attempt: RefundAttempt) => {
    attemptsRef.current = { ...attemptsRef.current, [orderNumber]: attempt };
    setAttempts(attemptsRef.current);
  };

  /* Only for an outcome that left the order exactly as it was. */
  const forgetAttempt = (orderNumber: string) => {
    const next = { ...attemptsRef.current };
    delete next[orderNumber];
    attemptsRef.current = next;
    setAttempts(next);
  };

  /*
   * Which order the drawer is on RIGHT NOW.
   *
   * An action reads this after its await to decide whether the panel it was
   * started from is still the panel on screen. The attempt map above is keyed
   * by order and is safe to write either way; `patched`, the reference box and
   * the confirm step belong to whichever order is open now, and writing one
   * order's answer into another order's panel is the failure this prevents.
   */
  const openNumberRef = useRef<string | null>(null);
  openNumberRef.current = openNumber;

  /* The drawer's own state — what is about the panel rather than about the
     money. The attempt map is deliberately not in here. */
  const resetDrawer = () => {
    setPatched(null);
    setReason('');
    setConfirming(false);
    setSettleOpen(false);
    setReference('');
    setSettleNote('');
  };

  const openOrder = (orderNumber: string) => {
    resetDrawer();
    /* Coming back to an order whose refund left money unaccounted for comes
       back to the same next action, with the same reference already typed. */
    const attempt = attemptsRef.current[orderNumber];
    if (attempt?.recordByHand && attempt.reference) {
      setSettleOpen(true);
      setReference(attempt.reference);
    }
    setOpenNumber(orderNumber);
  };

  const closeDrawer = () => {
    setOpenNumber(null);
    resetDrawer();
  };

  /* One refresh, both readings of the work: the queue, and the counts that are
     this page's strip AND the sidebar's badge. */
  const refreshAll = () => {
    queue.reload();
    reloadCounts();
  };

  /* ── Sending the money back ──────────────────────────────────────── */

  const sendRefund = async () => {
    if (!open) return;
    const orderNumber = open.orderNumber;

    /* The latch. Anything at all recorded against this order — a request still
       travelling, or an answer that ended the question — means this is the
       second press, and the second press must not reach the network. */
    if (attemptsRef.current[orderNumber]) return;
    noteAttempt(orderNumber, { ...NEW_ATTEMPT, sending: true });

    const res = await foodOrderService.refund(orderNumber, reason.trim() || undefined);

    /* The drawer may have moved on while this was in the air. */
    const showing = openNumberRef.current === orderNumber;
    if (showing) setConfirming(false);

    if (res.success && res.data) {
      const result = res.data;

      if (result.recorded && result.order) {
        noteAttempt(orderNumber, {
          ...NEW_ATTEMPT,
          outcome: 'spent',
          notice: { tone: 'good', text: result.message },
          reference: result.refund.reference,
        });
        if (showing) setPatched(result.order);
        setToast({ tone: 'good', message: result.message });
      } else {
        /*
         * The money moved and the order could not be saved. This is a success,
         * and it is the most dangerous success on the page: the only wrong
         * next move is to send it again. So the warning is loud, the send
         * button does not come back — and the control that warning names,
         * "record it as refunded", is opened underneath it with the gateway's
         * own reference already in the box, because a warning that hides the
         * action it asks for is just an accusation.
         */
        const text = result.warning || result.message;
        noteAttempt(orderNumber, {
          ...NEW_ATTEMPT,
          outcome: 'spent',
          notice: { tone: 'warn', text },
          recordByHand: true,
          reference: result.refund.reference,
        });
        if (showing) {
          setSettleOpen(true);
          setReference(result.refund.reference);
        }
        setToast({ tone: 'crit', message: text });
      }

      refreshAll();
      return;
    }

    /*
     * Nothing came back at all.
     *
     * The interceptor's sentence for this is "Backend server unreachable",
     * which is a claim about the server and this is a question about a
     * student's money: a refund slower than the fifteen seconds this console
     * waits, or an answer lost on the way home, leaves the money in exactly the
     * state a success does. Reporting it as a failure and re-arming the button
     * is how one payment gets refunded twice. It is reported as unknown, the
     * order stays latched, and the next step offered is to look.
     */
    if (res.unanswered) {
      noteAttempt(orderNumber, {
        ...NEW_ATTEMPT,
        outcome: 'unknown',
        notice: {
          tone: 'warn',
          text: 'We never heard back, so nobody knows yet whether that refund went through — '
            + 'it may well have. Reload this order and read the payment before anything else is '
            + 'sent.',
        },
        /* If it did go through and the order never learned, recording it by
           hand is the fix, so that control stays available. */
        recordByHand: true,
      });
      setToast({
        tone: 'crit',
        message: 'No answer from the server. That refund may or may not have gone through.',
      });
      detail.reload();
      refreshAll();
      return;
    }

    /* Razorpay's own description, shown exactly as it arrived. "The payment has
       been fully refunded" and "Your account is not activated for refunds" are
       different afternoons for whoever is reading this. */
    const message = res.message || 'That refund did not go through.';
    setToast({ tone: 'crit', message });

    if (res.code && FINAL_CODES.has(res.code)) {
      noteAttempt(orderNumber, {
        ...NEW_ATTEMPT,
        outcome: 'spent',
        notice: { tone: res.code === 'REFUND_IN_FLIGHT' ? 'warn' : 'crit', text: message },
      });
      detail.reload();
      refreshAll();
      return;
    }

    /* Nothing happened to the order, so the retry is a real retry. */
    forgetAttempt(orderNumber);
    detail.reload();
  };

  /*
   * After an unknown outcome, the only honest next step is to look.
   *
   * Refetches the order and the queue, and marks the attempt as checked, which
   * is what lets the panel offer a second attempt afterwards. A plain retry is
   * never offered before this has happened.
   */
  const recheck = (orderNumber: string) => {
    const attempt = attemptsRef.current[orderNumber];
    if (attempt) noteAttempt(orderNumber, { ...attempt, rechecked: true });
    detail.reload();
    refreshAll();
  };

  /* Arming it again is a decision somebody makes having read the payment, not
     a retry the page offers. Forgetting the attempt puts the panel back exactly
     as it was before the first press. */
  const armAgain = (orderNumber: string) => forgetAttempt(orderNumber);

  /* ── Writing down a refund that happened somewhere else ──────────── */

  const recordSettled = async () => {
    if (!open) return;
    const orderNumber = open.orderNumber;
    const before = attemptsRef.current[orderNumber];

    /* One write at a time per order, whichever of the two controls started it —
       the map is about the order's money, not about which button was pressed. */
    if (before?.sending) return;
    /* And no second claim against an order whose refund question was already
       answered some other way. */
    if (!canRecordByHand(before)) return;

    const trimmed = reference.trim();
    if (!trimmed) {
      setToast({
        tone: 'crit',
        message:
          'Give the reference it was refunded under — it is the only thing that lets anybody '
          + 'match this order to the money later.',
      });
      return;
    }

    noteAttempt(orderNumber, { ...(before ?? NEW_ATTEMPT), sending: true });

    const res = await foodOrderService.recordSettledRefund(
      orderNumber,
      trimmed,
      settleNote.trim() || undefined
    );

    const showing = openNumberRef.current === orderNumber;

    if (res.success && res.data?.order) {
      noteAttempt(orderNumber, {
        ...NEW_ATTEMPT,
        outcome: 'spent',
        notice: { tone: 'good', text: res.data.message },
        reference: res.data.refund.reference || trimmed,
      });
      if (showing) {
        setPatched(res.data.order);
        setSettleOpen(false);
      }
      setToast({ tone: 'good', message: res.data.message });
      refreshAll();
      return;
    }

    /* This one moves no money, so an answer that never arrived is only an
       unknown RECORD — but it is still not the "unreachable" the interceptor
       would say, because the write may have landed. */
    const message = res.unanswered
      ? 'We never heard back, so we cannot say whether that was written down. Reload the order '
        + 'and look before writing it again.'
      : res.message || 'That did not save.';
    setToast({ tone: 'crit', message });

    if (!res.unanswered && res.code && FINAL_CODES.has(res.code)) {
      noteAttempt(orderNumber, {
        ...NEW_ATTEMPT,
        outcome: 'spent',
        notice: { tone: 'crit', text: message },
      });
      detail.reload();
      refreshAll();
      return;
    }

    /* Nothing was written down, or nothing came back to say it was. Either way
       the answer is to look and write it again, so the panel goes back to
       exactly where it was — including a refund warning it was standing on. */
    if (before) noteAttempt(orderNumber, before);
    else forgetAttempt(orderNumber);
    detail.reload();
  };

  /* ── The counts strip, where every number is also a filter ───────── */

  const openFilterActive = needs === '' && status === 'open';

  const showEverything = () => {
    setNeeds('');
    setStatus('all');
  };

  const pickNeeds = (next: FoodOrderNeeds) => {
    setStatus('all');
    setNeeds(needs === next ? '' : next);
  };

  /* The header's search is not in here and Reset does not clear it: it belongs
     to the layout, it is cleared when the tab changes, and a button on the page
     that empties a box in the header is a button whose effect is off-screen. */
  const filtersTouched =
    needs !== 'human'
    || status !== 'all'
    || paymentStatus !== 'all'
    || paymentMode !== 'all'
    || dispatchState !== 'all'
    || !!from
    || !!to;

  const clearFilters = () => {
    setNeeds('human');
    setStatus('all');
    setPaymentStatus('all');
    setPaymentMode('all');
    setDispatchState('all');
    setFrom('');
    setTo('');
  };

  const emptyDescription = (): string => {
    if (q && needs !== '') {
      /* Almost always the real reason: the order is here and it is fine. Say
         so, rather than letting somebody conclude it does not exist. */
      return 'Nothing that needs a person matches that search. The order may well be here and '
        + 'perfectly healthy — drop the fault filter to see it.';
    }
    if (q) {
      return 'No order matches that search. An order number matches from its start, a phone '
        + 'number matches anywhere inside it, and a Razorpay id has to be exact.';
    }
    if (needs === 'human') return 'Nothing is waiting on a person. Every order is either moving or settled.';
    if (needs === 'refund') return 'No money is owed. Every online order that was cancelled or rejected has been sent back.';
    if (needs === 'dispatch') return 'Every open order either has a rider or is still being offered.';
    if (needs === 'stuck') {
      return tally
        ? `No open order is older than ${tally.stuckAfterMinutes} minutes.`
        : 'No open order has been sitting long enough to count as stuck.';
    }
    return 'No order matches these filters.';
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Food orders"
        description="The orders that need somebody. Find one by its number, read where its money went, and send it back when it is owed."
        actions={
          <Button
            variant="ghost"
            icon={RefreshCw}
            onClick={refreshAll}
            disabled={queue.refreshing}
          >
            Refresh
          </Button>
        }
      />

      {/* Every number here is a filter. A count somebody cannot act on is
          decoration — the same rule the support queue follows. */}
      {tally && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <CountCard
            label="Needs a human"
            value={tally.needsHuman}
            hint="Refunds, riders and delays — counted once each"
            tone="crit"
            active={needs === 'human'}
            onClick={() => pickNeeds('human')}
          />
          <CountCard
            label="Refund owed"
            value={tally.refundOwed}
            hint={`${rupees(tally.refundOwedValue)} still ours`}
            tone="crit"
            active={needs === 'refund'}
            onClick={() => pickNeeds('refund')}
          />
          <CountCard
            label="No rider found"
            value={tally.dispatchFailed}
            hint="Open, and the search gave up"
            tone="warn"
            active={needs === 'dispatch'}
            onClick={() => pickNeeds('dispatch')}
          />
          <CountCard
            label="Stuck"
            value={tally.stuck}
            hint={`Open for over ${tally.stuckAfterMinutes} minutes`}
            tone="warn"
            active={needs === 'stuck'}
            onClick={() => pickNeeds('stuck')}
          />
          <CountCard
            label="Open right now"
            value={tally.openOrders}
            hint="Placed through to picked up"
            tone="neutral"
            active={openFilterActive}
            onClick={() => {
              setNeeds('');
              setStatus(openFilterActive ? 'all' : 'open');
            }}
          />
        </div>
      )}

      <Card>
        {/* The search for an order is the header's box — see `q` above. */}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Status" className="w-44">
            <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">Any status</option>
              <option value="open">Still open</option>
              {FOOD_ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_META[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Payment" className="w-40">
            <Select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as FoodOrderPaymentStatus | 'all')}
            >
              <option value="all">Any</option>
              {FOOD_PAYMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_META[value].label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Paid by" className="w-40">
            <Select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as FoodOrderPaymentMode | 'all')}
            >
              <option value="all">Either</option>
              <option value="online">Online</option>
              <option value="cod">Cash</option>
            </Select>
          </Field>

          <Field label="Rider" className="w-44">
            <Select
              value={dispatchState}
              onChange={(e) => setDispatchState(e.target.value as FoodDispatchState | 'all')}
            >
              <option value="all">Any</option>
              {FOOD_DISPATCH_STATES.map((value) => (
                <option key={value} value={value}>
                  {DISPATCH_META[value].label}
                </option>
              ))}
            </Select>
          </Field>

          {/* A bare `to` date covers the whole of that day, server-side — a
              shift asking for "the 3rd" means the 3rd, not the instant it began. */}
          <Field label="Placed from" className="w-40">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Placed to" className="w-40">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>

          {filtersTouched && (
            <Button variant="ghost" onClick={clearFilters} className="mb-0.5">
              Reset
            </Button>
          )}
          {needs !== '' && (
            /* Named for what it does rather than for what it shows: other
               filters may still be on, and "show every order" would be a
               promise this button cannot keep. */
            <Button variant="ghost" onClick={showEverything} className="mb-0.5">
              Drop the fault filter
            </Button>
          )}
        </div>
      </Card>

      <Card padded={false} className="overflow-hidden">
        {queue.loading ? (
          <Table>
            <thead>
              <Tr>
                <Th>Order</Th>
                <Th>Kitchen</Th>
                <Th>Diner</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th>Placed</Th>
                <Th />
              </Tr>
            </thead>
            <tbody>
              <TableSkeleton cols={8} />
            </tbody>
          </Table>
        ) : queue.error ? (
          <div className="p-4">
            <ErrorState message={queue.error} onRetry={queue.reload} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ReceiptIndianRupee}
            title={needs === 'human' ? 'Nothing needs a human' : 'Nothing here'}
            description={emptyDescription()}
            action={
              needs !== '' ? (
                <Button variant="secondary" onClick={showEverything}>
                  Drop the fault filter
                </Button>
              ) : filtersTouched ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Reset the filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <thead>
                <Tr>
                  <Th>Order</Th>
                  <Th>Kitchen</Th>
                  <Th>Diner</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                  <Th>Payment</Th>
                  <Th>Placed</Th>
                  <Th />
                </Tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <QueueRow key={row.orderNumber} row={row} onOpen={() => openOrder(row.orderNumber)} />
                ))}
              </tbody>
            </Table>

            {/* The queue is paged server-side and can be longer than a screen,
                so the count is stated rather than implied by the scrollbar. */}
            {queue.data && (
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-line">
                <p className="text-label text-ink-3 tabular">
                  {queue.data.total} order{queue.data.total === 1 ? '' : 's'} · page{' '}
                  {queue.data.page} of {queue.data.pages}
                </p>
                {queue.data.pages > 1 && (
                  /* "Previous" and "Next" rather than "newer" and "older":
                     the server sorts oldest-first while a `needs` filter is on
                     and newest-first otherwise, so either of those words would
                     be a lie on half the views. */
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={ChevronLeft}
                      disabled={queue.data.page <= 1 || queue.refreshing}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={ChevronRight}
                      disabled={queue.data.page >= queue.data.pages || queue.refreshing}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── One order, reconciled ───────────────────────────────────── */}
      <Modal
        open={!!openNumber}
        onClose={closeDrawer}
        title={open?.orderNumber || openNumber || 'Order'}
        description={
          open
            ? `${open.restaurant.name || open.restaurant.restaurantId} · placed ${when(open.placedAt)}`
            : undefined
        }
        size="lg"
        footer={
          <Button variant="secondary" onClick={closeDrawer}>
            Close
          </Button>
        }
      >
        {!open && (detail.loading || detail.refreshing) ? (
          <p className="text-body text-ink-3">Loading the order…</p>
        ) : detail.error && !open ? (
          <ErrorState message={detail.error} onRetry={detail.reload} />
        ) : !open ? (
          <p className="text-body text-ink-3">Nothing to show.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_META[open.status].tone} icon={STATUS_META[open.status].icon}>
                {STATUS_META[open.status].label}
              </Badge>
              <Badge tone={PAYMENT_META[open.payment.status].tone}>
                {PAYMENT_META[open.payment.status].label} · {PAYMENT_MODE_LABEL[open.payment.mode]}
              </Badge>
              {open.fulfilment === 'delivery' && (
                <Badge tone={DISPATCH_META[open.dispatch.state].tone}>
                  {DISPATCH_META[open.dispatch.state].label}
                </Badge>
              )}
              {open.fulfilment === 'pickup' && <Badge tone="neutral">Collected by the diner</Badge>}
              {open.flags.refundOwed && (
                <Badge tone="crit" icon={Undo2}>
                  Refund owed
                </Badge>
              )}
              {open.flags.stuck && (
                <Badge tone="warn" icon={Timer}>
                  Stuck {elapsed(open.ageMinutes)}
                </Badge>
              )}
            </div>

            {!!open.rejectionReason && (
              <div className="rounded-control border border-crit-border bg-crit-soft p-3">
                <p className="text-micro uppercase text-crit mb-1">Why the kitchen refused it</p>
                <p className="text-body text-ink-2">{open.rejectionReason}</p>
              </div>
            )}

            {/* Who to ring comes first. Somebody opening this page is usually
                already on the phone to one of these three. */}
            <Section title="Who to ring">
              <DataRow
                label="Diner"
                value={
                  <span className="inline-flex items-center gap-2">
                    <User className="size-3.5 text-ink-3" aria-hidden />
                    {dash(open.customer.name)}
                    <PhoneLink phone={open.customer.phone} />
                  </span>
                }
              />
              <DataRow
                label="Kitchen"
                value={
                  <span className="inline-flex items-center gap-2">
                    <Store className="size-3.5 text-ink-3" aria-hidden />
                    {open.restaurant.name || open.restaurant.restaurantId}
                    <PhoneLink phone={open.restaurant.phone} />
                  </span>
                }
              />
              {!!open.restaurant.ownerName && (
                <DataRow
                  label="Owner"
                  value={
                    <span className="inline-flex items-center gap-2">
                      {open.restaurant.ownerName}
                      <PhoneLink phone={open.restaurant.ownerPhone} />
                    </span>
                  }
                />
              )}
              {open.rider ? (
                <DataRow
                  label="Rider"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <Bike className="size-3.5 text-ink-3" aria-hidden />
                      {dash(open.rider.name)}
                      <PhoneLink phone={open.rider.phone} />
                    </span>
                  }
                />
              ) : (
                <DataRow label="Rider" value="Nobody is carrying this" />
              )}
              {open.fulfilment === 'delivery' && (
                <DataRow
                  label="Delivering to"
                  value={
                    <span className="inline-flex items-start gap-2 text-right">
                      <MapPin className="size-3.5 text-ink-3 mt-0.5 shrink-0" aria-hidden />
                      {dash(open.customer.deliveryAddress)}
                    </span>
                  }
                />
              )}
            </Section>

            {/* ── Where the money is. The question this page exists for. ── */}
            <Section title="Where the money is">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-label text-ink-3 mb-1">What the diner paid</p>
                  <MoneyRow label="Items" value={open.money.itemsTotal} />
                  <MoneyRow label="Packaging" value={open.money.packagingCharge} />
                  <MoneyRow label="Delivery" value={open.money.deliveryFee} />
                  {open.money.discount > 0 && (
                    <MoneyRow label="Discount" value={-open.money.discount} />
                  )}
                  <MoneyRow label="Charged" value={open.money.grandTotal} strong />
                </div>
                <div>
                  <p className="text-label text-ink-3 mb-1">Where it goes</p>
                  <MoneyRow label="Kitchen keeps" value={open.money.partnerPayout} />
                  <MoneyRow
                    label={
                      open.money.commissionRate
                        ? `Commission (${open.money.commissionRate}%)`
                        : 'Commission'
                    }
                    /* Null, not zero, on an order that never had a payout
                       written — a dash says "nobody recorded this", a nought
                       would say "the kitchen earned nothing". */
                    value={open.money.commissionAmount}
                  />
                  <MoneyRow label="Rider earns" value={open.money.riderEarnings} />
                  <MoneyRow label="Lampose keeps" value={open.money.lamposeNet} strong />
                </div>
              </div>
            </Section>

            {/* ── The payment, and the refund ─────────────────────────── */}
            <Section title="Payment">
              <DataRow label="Paid by" value={PAYMENT_MODE_LABEL[open.payment.mode]} />
              <DataRow label="State" value={PAYMENT_META[open.payment.status].label} />
              {open.payment.mode === 'online' && (
                <>
                  <DataRow
                    label="Taken at the gateway"
                    value={
                      open.payment.amountPaise > 0 ? (
                        <span className="tabular">{rupeesFromPaise(open.payment.amountPaise)}</span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <DataRow label="Paid at" value={when(open.payment.paidAt)} />
                  <DataRow label="Razorpay order" value={dash(open.payment.razorpayOrderId)} mono />
                  <DataRow label="Razorpay payment" value={dash(open.payment.razorpayPaymentId)} mono />
                </>
              )}

              {open.payment.refund.state === 'settled' && (
                <div className="mt-3 rounded-control border border-good-border bg-good-soft p-3">
                  <p className="text-micro uppercase text-good mb-1">
                    Refunded
                    {open.payment.refund.channel === 'manual'
                      ? ' — recorded by hand'
                      : ' — through Razorpay'}
                  </p>
                  <p className="text-body text-ink-2 font-mono break-all">
                    {dash(open.payment.refund.reference)}
                  </p>
                  <p className="text-label text-ink-3 mt-1">
                    {when(open.payment.refund.at)}
                    {open.payment.refund.by ? ` · by ${open.payment.refund.by}` : ''}
                  </p>
                  {!!open.payment.refund.note && (
                    <p className="text-label text-ink-3 mt-1 break-words">
                      {open.payment.refund.note}
                    </p>
                  )}
                </div>
              )}

              {/* A failed attempt is on the record and stays on the screen —
                  the retry below is only truthful if what went wrong last time
                  is visible next to it. */}
              {open.payment.lastFailure && (
                <div className="mt-3 rounded-control border border-crit-border bg-crit-soft p-3">
                  <p className="text-micro uppercase text-crit mb-1">Last attempt failed</p>
                  <p className="text-body text-ink-2 break-words">{open.payment.lastFailure.note}</p>
                  <p className="text-label text-ink-3 mt-1">{when(open.payment.lastFailure.at)}</p>
                </div>
              )}
            </Section>

            <RefundPanel
              order={open}
              canRefund={canRefund}
              attempt={attempts[open.orderNumber]}
              reason={reason}
              onReason={setReason}
              confirming={confirming}
              onAsk={() => setConfirming(true)}
              onCancelAsk={() => setConfirming(false)}
              onSend={() => void sendRefund()}
              onRecheck={() => recheck(open.orderNumber)}
              onArmAgain={() => armAgain(open.orderNumber)}
              settleOpen={settleOpen}
              onSettleOpen={setSettleOpen}
              reference={reference}
              onReference={setReference}
              settleNote={settleNote}
              onSettleNote={setSettleNote}
              onSettle={() => void recordSettled()}
            />

            {/* ── What they ordered ───────────────────────────────────── */}
            <Section title={`What they ordered (${open.lines.length})`}>
              {open.lines.length === 0 ? (
                <p className="text-body text-ink-3">No lines were snapshotted on this order.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-body">
                    <tbody>
                      {open.lines.map((line, index) => (
                        <tr
                          key={`${line.productId || line.productName}-${index}`}
                          className="border-b border-line last:border-0 align-top"
                        >
                          <td className="py-2 pr-3 tabular text-ink-3 w-10">×{line.quantity}</td>
                          <td className="py-2 pr-3">
                            <p className="text-ink">
                              {line.productName}
                              {line.variantName ? ` · ${line.variantName}` : ''}
                            </p>
                            <p className="text-label text-ink-3">
                              {VEG_LABEL[line.isVeg] ?? line.isVeg}
                              {line.addOns.length
                                ? ` · with ${line.addOns.map((a) => a.name).join(', ')}`
                                : ''}
                            </p>
                            {!!line.note && (
                              <p className="text-label text-ink-3 italic">“{line.note}”</p>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular text-ink-3 whitespace-nowrap">
                            {money(line.unitPrice)}
                          </td>
                          <td className="py-2 text-right tabular text-ink whitespace-nowrap">
                            {money(line.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── Dispatch ────────────────────────────────────────────── */}
            {open.fulfilment === 'delivery' && (
              <Section title="Finding a rider">
                <DataRow label="State" value={DISPATCH_META[open.dispatch.state].label} />
                <DataRow label="Started" value={when(open.dispatch.startedAt)} />
                <DataRow
                  label="Riders asked"
                  value={
                    <span className="tabular">
                      {open.dispatch.candidateCount} shortlisted · {open.dispatch.attempts} offer
                      {open.dispatch.attempts === 1 ? '' : 's'} made
                    </span>
                  }
                />
                {!!open.dispatch.failureReason && (
                  <div className="mt-3 rounded-control border border-warn-border bg-warn-soft p-3">
                    <p className="text-micro uppercase text-warn mb-1">Why nobody came</p>
                    <p className="text-body text-ink-2">{open.dispatch.failureReason}</p>
                  </div>
                )}

                {open.dispatch.offers.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-body">
                      <tbody>
                        {open.dispatch.offers.map((offer, index) => (
                          <tr
                            key={`${offer.driverId}-${index}`}
                            className="border-b border-line last:border-0"
                          >
                            <td className="py-1.5 pr-3 font-mono text-label text-ink">
                              {offer.driverId}
                            </td>
                            <td className="py-1.5 pr-3 tabular text-ink-3 whitespace-nowrap">
                              {metres(offer.distanceMeters)}
                            </td>
                            <td className="py-1.5 pr-3">
                              <Badge tone={OFFER_META[offer.outcome].tone}>
                                {OFFER_META[offer.outcome].label}
                              </Badge>
                            </td>
                            <td className="py-1.5 text-label text-ink-3 break-words">
                              {offer.reason || when(offer.respondedAt ?? offer.offeredAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            )}

            {/* ── The rider who took it ───────────────────────────────── */}
            {open.rider && (
              <Section title="The rider">
                <DataRow label="Name" value={dash(open.rider.name)} />
                <DataRow label="Rider id" value={dash(open.rider.driverId)} mono />
                <DataRow
                  label="Vehicle"
                  value={[open.rider.vehicle.type, open.rider.vehicle.model, open.rider.vehicle.plate]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                />
                <DataRow label="Assigned" value={when(open.rider.assignedAt)} />
                <DataRow label="Picked up" value={when(open.rider.pickedUpAt)} />
                <DataRow label="Delivered" value={when(open.rider.deliveredAt)} />
                <DataRow
                  label="Accepted from"
                  value={
                    open.rider.acceptedFromMeters > 0 ? (
                      <span className="tabular">{metres(open.rider.acceptedFromMeters)} away</span>
                    ) : (
                      '—'
                    )
                  }
                />
                <DataRow
                  label="Earns"
                  value={<span className="tabular">{money(open.rider.earnings)}</span>}
                />
              </Section>
            )}

            {/* ── The history ─────────────────────────────────────────── */}
            <Section title="What happened, in order">
              {open.statusHistory.length === 0 ? (
                <p className="text-body text-ink-3">Nothing has been written against this order.</p>
              ) : (
                <ol className="list-none m-0 p-0 space-y-0">
                  {open.statusHistory.map((event, index) => (
                    <li
                      key={`${event.status}-${event.at ?? index}`}
                      className="relative pl-5 pb-3 last:pb-0"
                    >
                      <span
                        className="absolute left-[3px] top-1.5 size-1.5 rounded-full bg-line-strong"
                        aria-hidden
                      />
                      {index < open.statusHistory.length - 1 && (
                        <span
                          className="absolute left-[6px] top-3 bottom-0 w-px bg-line"
                          aria-hidden
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-body text-ink">
                          {STATUS_META[event.status]?.label ?? event.status}
                        </span>
                        <span className="text-label text-ink-3">{when(event.at)}</span>
                        <span className="text-label text-ink-3">· {event.by}</span>
                      </div>
                      {!!event.note && (
                        <p className="text-label text-ink-2 mt-0.5 break-words">{event.note}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section title="Reference">
              <DataRow label="Order number" value={open.orderNumber} mono />
              <DataRow label="Restaurant id" value={dash(open.restaurant.restaurantId)} mono />
              <DataRow label="Customer id" value={dash(open.customer.customerId)} mono />
              {/* The kitchen's hand-over code. The diner's delivery OTP is not
                  in this payload and is not the console's to hold. */}
              <DataRow label="Kitchen pickup code" value={dash(open.pickupCode)} mono />
              <DataRow label="Age" value={elapsed(open.ageMinutes)} />
              {open.promisedMinutes > 0 && (
                <DataRow label="Promised in" value={`${open.promisedMinutes} min`} />
              )}
            </Section>
          </div>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/** A number above the queue that is also the filter for the rows behind it. */
const CountCard: React.FC<{
  label: string;
  value: number;
  hint: string;
  tone: 'crit' | 'warn' | 'neutral';
  active: boolean;
  onClick: () => void;
}> = ({ label, value, hint, tone, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={cx(
      'text-left rounded-panel border p-3 transition-colors duration-120',
      active
        ? 'border-brand-border bg-brand-soft'
        : 'border-line bg-surface hover:border-line-strong'
    )}
  >
    <p className="text-micro uppercase text-ink-3">{label}</p>
    <p
      className={cx(
        'text-2xl font-semibold tabular mt-1',
        value > 0 && tone === 'crit' && 'text-crit',
        value > 0 && tone === 'warn' && 'text-warn',
        (value === 0 || tone === 'neutral') && 'text-ink'
      )}
    >
      {value}
    </p>
    <p className="text-label text-ink-3 mt-0.5">{hint}</p>
  </button>
);

/** One row of the queue: enough to triage without opening it. */
const QueueRow: React.FC<{ row: FoodOrderRow; onOpen: () => void }> = ({ row, onOpen }) => (
  <Tr>
    <Td>
      <p className="font-mono tabular font-medium text-ink">{row.orderNumber}</p>
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {row.flags.refundOwed && (
          <Badge tone="crit" icon={Undo2}>
            Refund owed
          </Badge>
        )}
        {row.flags.dispatchFailed && (
          <Badge tone="crit" icon={Truck}>
            No rider
          </Badge>
        )}
        {row.flags.stuck && (
          <Badge tone="warn" icon={Timer}>
            Stuck {elapsed(row.ageMinutes)}
          </Badge>
        )}
        {row.refund.state === 'settled' && (
          <Badge tone="good" icon={CheckCircle2}>
            Refunded
          </Badge>
        )}
      </div>
    </Td>
    <Td>
      {/* The id when nothing was ever written down, never an invented name. */}
      {row.restaurantName ? (
        <>
          <p className="text-ink">{row.restaurantName}</p>
          <p className="text-label text-ink-3 font-mono">{row.restaurantId}</p>
        </>
      ) : (
        <p className="text-ink font-mono">{row.restaurantId}</p>
      )}
    </Td>
    <Td>
      <p className="text-ink">{row.customerName || 'Unnamed'}</p>
      <p className="text-label text-ink-3 font-mono tabular">{dash(row.customerPhone)}</p>
    </Td>
    <Td className="text-right">
      <span className="tabular text-ink">{money(row.grandTotal)}</span>
    </Td>
    <Td>
      <Badge tone={STATUS_META[row.status].tone} icon={STATUS_META[row.status].icon}>
        {STATUS_META[row.status].label}
      </Badge>
    </Td>
    <Td>
      <Badge tone={PAYMENT_META[row.paymentStatus].tone}>
        {PAYMENT_META[row.paymentStatus].label}
      </Badge>
      <p className="text-label text-ink-3 mt-0.5">{PAYMENT_MODE_LABEL[row.paymentMode]}</p>
    </Td>
    <Td>
      <span className="text-label text-ink-2" title={formatDateTime(row.placedAt)}>
        {relativeTime(row.placedAt)}
      </span>
    </Td>
    <Td className="text-right">
      <Button variant="ghost" icon={ChevronRight} onClick={onOpen}>
        Open
      </Button>
    </Td>
  </Tr>
);

/**
 * The refund, and the record of a refund that happened elsewhere.
 *
 * Kept in one component so the two can never drift apart visually — they are
 * adjacent, they end in the same state, and the whole risk is somebody
 * pressing the wrong one. The red frame and the plain frame are the difference.
 */
const RefundPanel: React.FC<{
  order: FoodOrderDetail;
  canRefund: boolean;
  busy: boolean;
  notice: RefundNotice | null;
  reason: string;
  onReason: (value: string) => void;
  confirming: boolean;
  onAsk: () => void;
  onCancelAsk: () => void;
  onSend: () => void;
  settleOpen: boolean;
  onSettleOpen: (value: boolean) => void;
  reference: string;
  onReference: (value: string) => void;
  settleNote: string;
  onSettleNote: (value: string) => void;
  onSettle: () => void;
}> = ({
  order,
  canRefund,
  busy,
  notice,
  reason,
  onReason,
  confirming,
  onAsk,
  onCancelAsk,
  onSend,
  settleOpen,
  onSettleOpen,
  reference,
  onReference,
  settleNote,
  onSettleNote,
  onSettle,
}) => {
  const diner = order.customer.name || 'the diner';
  const settled = order.payment.refund.state === 'settled';

  /* Once anything has come back with a 200 for this order, the control is gone
     for the rest of the visit — including the shape where the money moved and
     the save did not. See the header. */
  if (notice) {
    return (
      <Section title="Refund">
        <div
          className={cx(
            'rounded-control border p-3',
            notice.tone === 'good' && 'border-good-border bg-good-soft',
            notice.tone === 'warn' && 'border-warn-border bg-warn-soft',
            notice.tone === 'crit' && 'border-crit-border bg-crit-soft'
          )}
        >
          <p className="text-body text-ink break-words">{notice.text}</p>
          {notice.tone === 'warn' && (
            <p className="text-label text-ink-2 mt-1.5">
              Do not send this again. Write the reference against the order by hand — the money
              has already left.
            </p>
          )}
        </div>
      </Section>
    );
  }

  if (settled) {
    /* The record itself is drawn above, in Payment. Repeating it here would
       give the same fact two homes; saying there is nothing to do is useful. */
    return (
      <Section title="Refund">
        <p className="text-body text-ink-3">
          This one is settled. Nothing is owed and there is nothing to send.
        </p>
      </Section>
    );
  }

  if (!canRefund) {
    return (
      <Section title="Refund">
        <p className="text-body text-ink-3 flex items-start gap-2">
          <ShieldCheck className="size-4 shrink-0 mt-0.5" aria-hidden />
          {order.payment.refundable
            ? 'This order is owed a refund. Sending it needs the Admin or Super Admin role — '
              + 'reading it does not.'
            : order.payment.refundBlockedReason
              || 'There is nothing to send back on this order.'}
        </p>
      </Section>
    );
  }

  if (!order.payment.refundable) {
    return (
      <Section title="Refund">
        {/* The server's own sentence, verbatim. It knows which of the four
            reasons applies and this page does not re-derive it. */}
        <p className="text-body text-ink-3">
          {order.payment.refundBlockedReason || 'There is nothing to send back on this order.'}
        </p>
      </Section>
    );
  }

  return (
    <Section title="Refund">
      <div className="rounded-control border border-crit-border bg-crit-soft p-3">
        {confirming ? (
          <>
            <p className="text-body font-medium text-ink">Send this payment back to {diner}?</p>
            <div className="text-body text-ink-2 mt-1.5 space-y-1">
              {order.payment.amountPaise > 0 ? (
                <p>
                  Razorpay recorded taking{' '}
                  <span className="tabular font-medium text-ink">
                    {rupeesFromPaise(order.payment.amountPaise)}
                  </span>{' '}
                  for {order.orderNumber}
                  {order.payment.paidAt ? ` on ${when(order.payment.paidAt)}` : ''}.
                </p>
              ) : (
                <p>Nothing on this order says what the gateway took, only that it was paid.</p>
              )}
              {/* No figure of ours goes here. The gateway refunds the whole
                  captured payment and reports the real number back. */}
              <p>
                The whole of that payment goes back. Razorpay decides the exact amount and tells
                us afterwards — there is no way to send part of it, and no figure here is ours.
              </p>
              <p>It cannot be undone from this console.</p>
              {!!reason.trim() && (
                /* What is about to be written, shown before it is written —
                   this sentence ends up on the order's history and in
                   Razorpay's notes, and the confirm step is the last chance to
                   read it back. */
                <p className="text-ink-3">Recorded as: “{reason.trim()}”</p>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-3">
              <Button variant="secondary" onClick={onCancelAsk} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" icon={Undo2} onClick={onSend} loading={busy} disabled={busy}>
                {busy ? 'Sending…' : `Send it back to ${diner}`}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body font-medium text-ink flex items-center gap-2">
              <TriangleAlert className="size-4 text-crit shrink-0" aria-hidden />
              This order is owed a refund
            </p>
            <p className="text-body text-ink-2 mt-1">
              Razorpay sends the whole captured payment back to {diner}. It is one press, it is
              final, and it is recorded against your name.
            </p>
            <div className="mt-3">
              <Field
                label="Why"
                hint="Optional, kept to 200 characters. It goes onto the order's history and into Razorpay's own notes — it is what somebody reads six weeks from now trying to work out what this was."
              >
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => onReason(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. the kitchen was closed and the diner cancelled"
                />
              </Field>
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="danger" icon={HandCoins} onClick={onAsk} disabled={busy}>
                Refund {diner}
              </Button>
            </div>
          </>
        )}
      </div>

      {/* A different act with the same ending, so a different frame and a
          different verb. This one moves no money; it writes down that money
          already moved, which is why the reference is not optional. */}
      <div className="mt-3 rounded-control border border-line bg-surface-subtle p-3">
        {settleOpen ? (
          <>
            <p className="text-body font-medium text-ink">Already refunded somewhere else</p>
            <p className="text-body text-ink-2 mt-1">
              This sends nothing. It records that the money has already gone, takes the order out
              of the queue, and tells everybody afterwards that the debt is settled — so it has to
              be true.
            </p>
            <div className="mt-3 space-y-3">
              <Field
                label="Reference"
                required
                hint="The Razorpay refund id, or the bank reference. Up to 64 characters. It is the only thing that will ever let anybody match this order to the money."
              >
                <Input
                  value={reference}
                  onChange={(e) => onReference(e.target.value)}
                  maxLength={64}
                  placeholder="rfnd_… or a bank reference"
                />
              </Field>
              <Field label="Note" hint="Optional, up to 80 characters — where it was done.">
                <Input
                  value={settleNote}
                  onChange={(e) => onSettleNote(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. razorpay dashboard"
                />
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2 mt-3">
              <Button variant="secondary" onClick={() => onSettleOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                icon={CheckCircle2}
                onClick={onSettle}
                loading={busy}
                disabled={busy || !reference.trim()}
              >
                Record it as refunded
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-body text-ink-2">
              Somebody already refunded this in the Razorpay dashboard or by transfer?
            </p>
            <Button variant="secondary" icon={History} onClick={() => onSettleOpen(true)}>
              Record it
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <p className="text-micro uppercase text-ink-3 mb-1.5">{title}</p>
    <div>{children}</div>
  </div>
);

/** One line of the reconciliation. Tabular, so the column reads down. */
const MoneyRow: React.FC<{ label: string; value: number | null; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-line last:border-0">
    <span className={cx('text-sm', strong ? 'text-ink' : 'text-ink-3')}>{label}</span>
    <span className={cx('text-sm tabular text-right', strong ? 'text-ink font-medium' : 'text-ink-2')}>
      {money(value)}
    </span>
  </div>
);

/** A number nobody has to copy out by hand. */
const PhoneLink: React.FC<{ phone: string }> = ({ phone }) => {
  if (!phone) return <span className="text-ink-3">no number</span>;
  return (
    <a
      href={`tel:${phone}`}
      className="inline-flex items-center gap-1 font-mono tabular text-brand-ink hover:underline"
    >
      <Phone className="size-3" aria-hidden />
      {phone}
    </a>
  );
};

export default FoodOrdersPage;

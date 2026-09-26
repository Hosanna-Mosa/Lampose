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
import { Section } from '../components/common/molecules/Section';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bike,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ReceiptIndianRupee,
  RefreshCw,
  Store,
  Timer,
  Undo2,
  User,
} from 'lucide-react';

import { Badge } from '../components/common/atoms/Badge';
import type { BadgeTone } from '../components/common/atoms/Badge';
import { Button } from '../components/common/atoms/Button';
import { Card } from '../components/common/atoms/Card';
import { Input } from '../components/common/atoms/Input';
import { Select } from '../components/common/atoms/Select';
import { Table, Th, Tr } from '../components/common/atoms/Table';
import { DataRow } from '../components/common/molecules/DataRow';
import { EmptyState } from '../components/common/molecules/EmptyState';
import { ErrorState } from '../components/common/molecules/ErrorState';
import { Field } from '../components/common/molecules/Field';
import { PageHeader } from '../components/common/molecules/PageHeader';
import { TableSkeleton } from '../components/common/molecules/TableSkeleton';
import { Modal } from '../components/common/organisms/Modal';
import { Toast } from '../components/common/organisms/Toast';
import type { ToastState } from '../components/common/organisms/Toast';
import {
  FOOD_DISPATCH_STATES,
  FOOD_ORDER_OPEN_STATUSES,
  FOOD_ORDER_STATUSES,
  FOOD_PAYMENT_STATUSES,
  foodOrderService,
} from '../api/services/foodOrderService';
import { useAuth } from '../context/AuthContext';
import { useDebounced, useFetch } from '../lib/useFetch';
import { rupees, rupeesFromPaise } from '../lib/format';
import type {
  FoodDispatchOfferOutcome,
  FoodDispatchState,
  FoodOrderFulfilment,
  FoodOrderCounts,
  FoodOrderDetail,
  FoodOrderNeeds,
  FoodOrderPaymentMode,
  FoodOrderPaymentStatus,
  FoodOrderQuery,
  FoodOrderStatus,
  FoodRefundCode,
} from '../api/types';

import { CountCard } from '../components/food-orders/molecules/CountCard';
import { QueueRow } from '../components/food-orders/molecules/QueueRow';
import { RefundPanel } from '../components/food-orders/organisms/RefundPanel';
import { MoneyRow } from '../components/food-orders/molecules/MoneyRow';
import { PhoneLink } from '../components/food-orders/atoms/PhoneLink';
import {
  STATUS_META, PAYMENT_META, PAYMENT_MODE_LABEL, COLLECTION_LABEL, paymentModeLine,
  money, dash, when, elapsed,
  NEW_ATTEMPT, canRecordByHand,
} from '../components/food-orders/utils';
import type { RefundAttempt } from '../components/food-orders/utils';
import { Box } from '../components/common/atoms/Box';
import { Inline } from '../components/common/atoms/Inline';
import { List } from '../components/common/atoms/List';
import { ListItem } from '../components/common/atoms/ListItem';
import { Option } from '../components/common/atoms/Option';
import { PlainTable, PlainTd, PlainTr, TableBody, TableHead } from '../components/common/atoms/PlainTable';
import { Text } from '../components/common/atoms/Text';
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
 * The roles the backend lets mark a website order delivered — `food.complete` in
 * `iam.roles.js`. The same two as a refund, and mirrored for the same reason: so
 * a button that would 403 is never drawn. The restaurant cannot do this at all
 * (it is not staff), and neither can 'Food Admin' — deciding who cooks and who
 * rides is not the authority to close an order.
 */
const COMPLETING_ROLES = new Set(['Super Admin', 'Admin']);

/** Who brings a website order, in the words of the person reading this page. */
const deliveredByLabel = (order: FoodOrderDetail): string => {
  if (order.deliveryMethod === 'self') return "The restaurant's own delivery person";
  if (order.deliveryMethod === 'driver') return 'A Lampose driver, asked for on WhatsApp';
  if (order.channel === 'web') return 'Not chosen yet';
  return 'Nobody is carrying this';
};

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


export const FoodOrdersPage: React.FC<FoodOrdersPageProps> = ({
  search,
  counts,
  reloadCounts,
}) => {
  const { user } = useAuth();
  const canRefund = REFUNDING_ROLES.has(user?.role ?? '');
  const canComplete = COMPLETING_ROLES.has(user?.role ?? '');

  /* The landing view is the work, not the archive. */
  const [needs, setNeeds] = useState<FoodOrderNeeds | ''>('human');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [paymentStatus, setPaymentStatus] = useState<FoodOrderPaymentStatus | 'all'>('all');
  const [paymentMode, setPaymentMode] = useState<FoodOrderPaymentMode | 'all'>('all');
  const [dispatchState, setDispatchState] = useState<FoodDispatchState | 'all'>('all');
  /* Delivery, pickup, or both. Its own filter because every other one on this
     screen describes the RIDE, and a pickup order has no ride to describe. */
  const [fulfilment, setFulfilment] = useState<FoodOrderFulfilment | 'all'>('all');
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
  /* "Mark delivered": one press asks, a second press does it. */
  const [deliverStep, setDeliverStep] = useState<'idle' | 'asking' | 'sending'>('idle');
  const [deliverNote, setDeliverNote] = useState('');
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
      fulfilment,
      status: statusParam(status),
      paymentStatus,
      paymentMode,
      dispatchState,
      from,
      to,
      q,
      page,
    }),
    [needs, fulfilment, status, paymentStatus, paymentMode, dispatchState, from, to, q, page]
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
  }, [needs, fulfilment, status, paymentStatus, paymentMode, dispatchState, from, to, q]);

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
    setDeliverStep('idle');
    setDeliverNote('');
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

  /* ── Saying a website order arrived ──────────────────────────────── */

  /* The order being written, so a second press while the first is in the air
     never reaches the network — for ANY order, whichever the drawer shows. */
  const deliveringRef = useRef<string | null>(null);

  const sendDelivered = async () => {
    if (!open || deliveringRef.current) return;
    const orderNumber = open.orderNumber;
    deliveringRef.current = orderNumber;
    setDeliverStep('sending');

    const res = await foodOrderService.markDelivered(orderNumber, deliverNote.trim() || undefined);
    deliveringRef.current = null;

    /* The drawer may have moved on while this was in the air. */
    const showing = openNumberRef.current === orderNumber;

    if (res.success && res.data) {
      if (showing) {
        setPatched(res.data);
        setDeliverStep('idle');
        setDeliverNote('');
      }
      setToast({ tone: 'good', message: `${orderNumber} is marked delivered.` });
      refreshAll();
      return;
    }

    /* Refused — most often because the diner pressed their own button a moment
       ago (ALREADY_DELIVERED) — or never answered. Either way the order may
       not be as this panel last saw it, so look again rather than guess. */
    setToast({ tone: 'crit', message: res.message || 'That could not be saved. Reload the order and look.' });
    if (showing) setDeliverStep('idle');
    detail.reload();
    refreshAll();
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
    || fulfilment !== 'all'
    || !!from
    || !!to;

  const clearFilters = () => {
    setNeeds('human');
    setStatus('all');
    setPaymentStatus('all');
    setPaymentMode('all');
    setDispatchState('all');
    setFulfilment('all');
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
    <Box className="space-y-4">
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
        <Box className="grid grid-cols-2 lg:grid-cols-5 gap-3">
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
        </Box>
      )}

      <Card>
        {/* The search for an order is the header's box — see `q` above. */}
        <Box className="flex flex-wrap items-end gap-3">
          <Field label="Status" className="w-44">
            <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <Option value="all">Any status</Option>
              <Option value="open">Still open</Option>
              {FOOD_ORDER_STATUSES.map((value) => (
                <Option key={value} value={value}>
                  {STATUS_META[value].label}
                </Option>
              ))}
            </Select>
          </Field>

          <Field label="Payment" className="w-40">
            <Select
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value as FoodOrderPaymentStatus | 'all')}
            >
              <Option value="all">Any</Option>
              {FOOD_PAYMENT_STATUSES.map((value) => (
                <Option key={value} value={value}>
                  {PAYMENT_META[value].label}
                </Option>
              ))}
            </Select>
          </Field>

          <Field label="Paid by" className="w-40">
            <Select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as FoodOrderPaymentMode | 'all')}
            >
              <Option value="all">Either</Option>
              <Option value="online">Online</Option>
              <Option value="cod">Cash</Option>
            </Select>
          </Field>

          {/*
            Collection has been withdrawn — the order endpoint refuses one — so
            this finds the handful placed before that and nothing else. They are
            the hardest orders on this screen to reason about precisely because
            no rider is coming for them: a pickup order can never be flagged as
            one that lost its ride, and it reaches the "needs a person" queue
            only by going stale. Choosing it drops that filter for the same
            reason.
          */}
          <Field label="Fulfilment" className="w-44">
            <Select
              value={fulfilment}
              onChange={(e) => {
                const next = e.target.value as FoodOrderFulfilment | 'all';
                setFulfilment(next);
                if (next !== 'all') setNeeds('');
              }}
            >
              <Option value="all">Either</Option>
              <Option value="delivery">Delivery</Option>
              <Option value="pickup">Pickup (withdrawn)</Option>
            </Select>
          </Field>

          <Field label="Rider" className="w-44">
            <Select
              value={dispatchState}
              onChange={(e) => setDispatchState(e.target.value as FoodDispatchState | 'all')}
            >
              <Option value="all">Any</Option>
              {FOOD_DISPATCH_STATES.map((value) => (
                <Option key={value} value={value}>
                  {DISPATCH_META[value].label}
                </Option>
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
        </Box>
      </Card>

      <Card padded={false} className="overflow-hidden">
        {queue.loading ? (
          <Table>
            <TableHead>
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
            </TableHead>
            <TableBody>
              <TableSkeleton cols={8} />
            </TableBody>
          </Table>
        ) : queue.error ? (
          <Box className="p-4">
            <ErrorState message={queue.error} onRetry={queue.reload} />
          </Box>
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
              <TableHead>
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
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <QueueRow key={row.orderNumber} row={row} onOpen={() => openOrder(row.orderNumber)} />
                ))}
              </TableBody>
            </Table>

            {/* The queue is paged server-side and can be longer than a screen,
                so the count is stated rather than implied by the scrollbar. */}
            {queue.data && (
              <Box className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-line">
                <Text className="text-label text-ink-3 tabular">
                  {queue.data.total} order{queue.data.total === 1 ? '' : 's'} · page{' '}
                  {queue.data.page} of {queue.data.pages}
                </Text>
                {queue.data.pages > 1 && (
                  /* "Previous" and "Next" rather than "newer" and "older":
                     the server sorts oldest-first while a `needs` filter is on
                     and newest-first otherwise, so either of those words would
                     be a lie on half the views. */
                  <Box className="flex items-center gap-2">
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
                  </Box>
                )}
              </Box>
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
          <Text className="text-body text-ink-3">Loading the order…</Text>
        ) : detail.error && !open ? (
          <ErrorState message={detail.error} onRetry={detail.reload} />
        ) : !open ? (
          <Text className="text-body text-ink-3">Nothing to show.</Text>
        ) : (
          <Box className="space-y-5">
            <Box className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_META[open.status].tone} icon={STATUS_META[open.status].icon}>
                {STATUS_META[open.status].label}
              </Badge>
              <Badge tone={PAYMENT_META[open.payment.status].tone}>
                {PAYMENT_META[open.payment.status].label} ·{' '}
                {paymentModeLine(open.payment.mode, open.payment.collection.method)}
              </Badge>
              {open.fulfilment === 'delivery' && !open.deliveryMethod && (
                <Badge tone={DISPATCH_META[open.dispatch.state].tone}>
                  {DISPATCH_META[open.dispatch.state].label}
                </Badge>
              )}
              {/* A website order the restaurant arranged has no search for a
                  rider, so "no rider needed yet" would only confuse. */}
              {open.fulfilment === 'delivery' && !!open.deliveryMethod && (
                <Badge tone="neutral" icon={Bike}>
                  {open.deliveryMethod === 'self' ? 'Restaurant delivers' : 'Lampose driver asked'}
                </Badge>
              )}
              {open.channel === 'web' && <Badge tone="neutral">Website order</Badge>}
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
            </Box>

            {!!open.rejectionReason && (
              <Box className="rounded-control border border-crit-border bg-crit-soft p-3">
                <Text className="text-micro uppercase text-crit mb-1">Why the kitchen refused it</Text>
                <Text className="text-body text-ink-2">{open.rejectionReason}</Text>
              </Box>
            )}

            {/* A website order ends when the diner says it reached them — or when
                an admin does, for the diner who never pressed it. Everybody else
                sees who is delivering and nothing to press. */}
            {open.canMarkDelivered && (
              <Section title="Has it been delivered?">
                <Text className="text-body text-ink-2">
                  {open.status === 'picked_up'
                    ? 'The restaurant says the delivery boy has taken this order. The diner has been asked to confirm it arrived.'
                    : 'The restaurant has not yet said the delivery boy took this order.'}
                </Text>
                {!canComplete ? (
                  <Text className="text-label text-ink-3 mt-2">
                    Only a Super Admin or an Admin can mark a website order delivered.
                  </Text>
                ) : deliverStep === 'idle' ? (
                  <Box className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={CheckCircle2}
                      onClick={() => setDeliverStep('asking')}
                    >
                      Mark delivered
                    </Button>
                  </Box>
                ) : (
                  <Box className="mt-3 space-y-3">
                    <Field
                      label="Note (optional)"
                      hint="Kept in the order's history, beside your name. For example: the diner confirmed by phone."
                    >
                      <Input
                        value={deliverNote}
                        maxLength={150}
                        disabled={deliverStep === 'sending'}
                        onChange={(e) => setDeliverNote(e.target.value)}
                      />
                    </Field>
                    <Box className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        icon={CheckCircle2}
                        loading={deliverStep === 'sending'}
                        disabled={deliverStep === 'sending'}
                        onClick={() => void sendDelivered()}
                      >
                        Yes, it was delivered
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deliverStep === 'sending'}
                        onClick={() => setDeliverStep('idle')}
                      >
                        Not yet
                      </Button>
                    </Box>
                    <Text className="text-label text-ink-3">
                      This closes the order for the diner and the restaurant
                      {open.payment.mode === 'cod' ? ', and marks the cash as collected' : ''}.
                    </Text>
                  </Box>
                )}
              </Section>
            )}

            {/* Who to ring comes first. Somebody opening this page is usually
                already on the phone to one of these three. */}
            <Section title="Who to ring">
              <DataRow
                label="Diner"
                value={
                  <Inline className="inline-flex items-center gap-2">
                    <User className="size-3.5 text-ink-3" aria-hidden />
                    {dash(open.customer.name)}
                    <PhoneLink phone={open.customer.phone} />
                  </Inline>
                }
              />
              <DataRow
                label="Kitchen"
                value={
                  <Inline className="inline-flex items-center gap-2">
                    <Store className="size-3.5 text-ink-3" aria-hidden />
                    {open.restaurant.name || open.restaurant.restaurantId}
                    <PhoneLink phone={open.restaurant.phone} />
                  </Inline>
                }
              />
              {!!open.restaurant.ownerName && (
                <DataRow
                  label="Owner"
                  value={
                    <Inline className="inline-flex items-center gap-2">
                      {open.restaurant.ownerName}
                      <PhoneLink phone={open.restaurant.ownerPhone} />
                    </Inline>
                  }
                />
              )}
              {open.rider ? (
                <DataRow
                  label="Rider"
                  value={
                    <Inline className="inline-flex items-center gap-2">
                      <Bike className="size-3.5 text-ink-3" aria-hidden />
                      {dash(open.rider.name)}
                      <PhoneLink phone={open.rider.phone} />
                    </Inline>
                  }
                />
              ) : (
                <DataRow
                  label={open.channel === 'web' || open.deliveryMethod ? 'Delivered by' : 'Rider'}
                  value={deliveredByLabel(open)}
                />
              )}
              {open.fulfilment === 'delivery' && (
                <DataRow
                  label="Delivering to"
                  value={
                    <Inline className="inline-flex items-start gap-2 text-right">
                      <MapPin className="size-3.5 text-ink-3 mt-0.5 shrink-0" aria-hidden />
                      {dash(open.customer.deliveryAddress)}
                    </Inline>
                  }
                />
              )}
            </Section>

            {/* ── Where the money is. The question this page exists for. ── */}
            <Section title="Where the money is">
              <Box className="grid gap-4 md:grid-cols-2">
                <Box>
                  <Text className="text-label text-ink-3 mb-1">What the diner paid</Text>
                  <MoneyRow label="Items" value={open.money.itemsTotal} />
                  {/* Only on an order charged one, before GST and the platform
                      fee replaced it. */}
                  {open.money.packagingCharge > 0 && (
                    <MoneyRow label="Packaging" value={open.money.packagingCharge} />
                  )}
                  <MoneyRow
                    label={open.money.gstRate ? `GST (${open.money.gstRate}%)` : 'GST'}
                    value={open.money.gst}
                  />
                  <MoneyRow label="Platform fee" value={open.money.platformFee} />
                  <MoneyRow label="Delivery" value={open.money.deliveryFee} />
                  {open.money.discount > 0 && (
                    <MoneyRow label="Discount" value={-open.money.discount} />
                  )}
                  <MoneyRow label="Charged" value={open.money.grandTotal} strong />
                </Box>
                <Box>
                  <Text className="text-label text-ink-3 mb-1">Where it goes</Text>
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
                </Box>
              </Box>
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
                        <Inline className="tabular">{rupeesFromPaise(open.payment.amountPaise)}</Inline>
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

              {/* The doorstep half of a cash-on-delivery order: cash into the
                  rider's hand, or UPI on the rider's QR. Empty until delivered. */}
              {open.payment.mode === 'cod' && (
                <>
                  <DataRow
                    label="Collected at the door"
                    value={open.payment.collection.method ? COLLECTION_LABEL[open.payment.collection.method] : '—'}
                  />
                  {!!open.payment.collection.method && (
                    <>
                      <DataRow
                        label="Amount collected"
                        value={
                          <Inline className="tabular">
                            {rupeesFromPaise(open.payment.collection.amountPaise)}
                          </Inline>
                        }
                      />
                      <DataRow label="Collected at" value={when(open.payment.collection.collectedAt)} />
                      <DataRow label="Collected by rider" value={dash(open.payment.collection.collectedBy)} mono />
                    </>
                  )}
                  {open.payment.collection.method === 'upi_qr' && (
                    <DataRow label="Razorpay payment" value={dash(open.payment.razorpayPaymentId)} mono />
                  )}
                </>
              )}

              {open.payment.refund.state === 'settled' && (
                <Box className="mt-3 rounded-control border border-good-border bg-good-soft p-3">
                  <Text className="text-micro uppercase text-good mb-1">
                    Refunded
                    {open.payment.refund.channel === 'manual'
                      ? ' — recorded by hand'
                      : ' — through Razorpay'}
                  </Text>
                  <Text className="text-body text-ink-2 font-mono break-all">
                    {dash(open.payment.refund.reference)}
                  </Text>
                  <Text className="text-label text-ink-3 mt-1">
                    {when(open.payment.refund.at)}
                    {open.payment.refund.by ? ` · by ${open.payment.refund.by}` : ''}
                  </Text>
                  {!!open.payment.refund.note && (
                    <Text className="text-label text-ink-3 mt-1 break-words">
                      {open.payment.refund.note}
                    </Text>
                  )}
                </Box>
              )}

              {/* A failed attempt is on the record and stays on the screen —
                  the retry below is only truthful if what went wrong last time
                  is visible next to it. */}
              {open.payment.lastFailure && (
                <Box className="mt-3 rounded-control border border-crit-border bg-crit-soft p-3">
                  <Text className="text-micro uppercase text-crit mb-1">Last attempt failed</Text>
                  <Text className="text-body text-ink-2 break-words">{open.payment.lastFailure.note}</Text>
                  <Text className="text-label text-ink-3 mt-1">{when(open.payment.lastFailure.at)}</Text>
                </Box>
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
                <Text className="text-body text-ink-3">No lines were snapshotted on this order.</Text>
              ) : (
                <Box className="overflow-x-auto">
                  <PlainTable className="w-full text-body">
                    <TableBody>
                      {open.lines.map((line, index) => (
                        <PlainTr
                          key={`${line.productId || line.productName}-${index}`}
                          className="border-b border-line last:border-0 align-top"
                        >
                          <PlainTd className="py-2 pr-3 tabular text-ink-3 w-10">×{line.quantity}</PlainTd>
                          <PlainTd className="py-2 pr-3">
                            <Text className="text-ink">
                              {line.productName}
                              {line.variantName ? ` · ${line.variantName}` : ''}
                            </Text>
                            <Text className="text-label text-ink-3">
                              {VEG_LABEL[line.isVeg] ?? line.isVeg}
                              {line.addOns.length
                                ? ` · with ${line.addOns.map((a) => a.name).join(', ')}`
                                : ''}
                            </Text>
                            {!!line.note && (
                              <Text className="text-label text-ink-3 italic">“{line.note}”</Text>
                            )}
                          </PlainTd>
                          <PlainTd className="py-2 pr-3 text-right tabular text-ink-3 whitespace-nowrap">
                            {money(line.unitPrice)}
                          </PlainTd>
                          <PlainTd className="py-2 text-right tabular text-ink whitespace-nowrap">
                            {money(line.lineTotal)}
                          </PlainTd>
                        </PlainTr>
                      ))}
                    </TableBody>
                  </PlainTable>
                </Box>
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
                    <Inline className="tabular">
                      {open.dispatch.candidateCount} shortlisted · {open.dispatch.attempts} offer
                      {open.dispatch.attempts === 1 ? '' : 's'} made
                    </Inline>
                  }
                />
                {!!open.dispatch.failureReason && (
                  <Box className="mt-3 rounded-control border border-warn-border bg-warn-soft p-3">
                    <Text className="text-micro uppercase text-warn mb-1">Why nobody came</Text>
                    <Text className="text-body text-ink-2">{open.dispatch.failureReason}</Text>
                  </Box>
                )}

                {open.dispatch.offers.length > 0 && (
                  <Box className="mt-3 overflow-x-auto">
                    <PlainTable className="w-full text-body">
                      <TableBody>
                        {open.dispatch.offers.map((offer, index) => (
                          <PlainTr
                            key={`${offer.driverId}-${index}`}
                            className="border-b border-line last:border-0"
                          >
                            <PlainTd className="py-1.5 pr-3 font-mono text-label text-ink">
                              {offer.driverId}
                            </PlainTd>
                            <PlainTd className="py-1.5 pr-3 tabular text-ink-3 whitespace-nowrap">
                              {metres(offer.distanceMeters)}
                            </PlainTd>
                            <PlainTd className="py-1.5 pr-3">
                              <Badge tone={OFFER_META[offer.outcome].tone}>
                                {OFFER_META[offer.outcome].label}
                              </Badge>
                            </PlainTd>
                            <PlainTd className="py-1.5 text-label text-ink-3 break-words">
                              {offer.reason || when(offer.respondedAt ?? offer.offeredAt)}
                            </PlainTd>
                          </PlainTr>
                        ))}
                      </TableBody>
                    </PlainTable>
                  </Box>
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
                      <Inline className="tabular">{metres(open.rider.acceptedFromMeters)} away</Inline>
                    ) : (
                      '—'
                    )
                  }
                />
                <DataRow
                  label="Earns"
                  value={<Inline className="tabular">{money(open.rider.earnings)}</Inline>}
                />
              </Section>
            )}

            {/* ── The history ─────────────────────────────────────────── */}
            <Section title="What happened, in order">
              {open.statusHistory.length === 0 ? (
                <Text className="text-body text-ink-3">Nothing has been written against this order.</Text>
              ) : (
                <List ordered className="list-none m-0 p-0 space-y-0">
                  {open.statusHistory.map((event, index) => (
                    <ListItem
                      key={`${event.status}-${event.at ?? index}`}
                      className="relative pl-5 pb-3 last:pb-0"
                    >
                      <Inline
                        className="absolute left-[3px] top-1.5 size-1.5 rounded-full bg-line-strong"
                        aria-hidden
                      />
                      {index < open.statusHistory.length - 1 && (
                        <Inline
                          className="absolute left-[6px] top-3 bottom-0 w-px bg-line"
                          aria-hidden
                        />
                      )}
                      <Box className="flex flex-wrap items-center gap-2">
                        <Inline className="text-body text-ink">
                          {STATUS_META[event.status]?.label ?? event.status}
                        </Inline>
                        <Inline className="text-label text-ink-3">{when(event.at)}</Inline>
                        <Inline className="text-label text-ink-3">· {event.by}</Inline>
                      </Box>
                      {!!event.note && (
                        <Text className="text-label text-ink-2 mt-0.5 break-words">{event.note}</Text>
                      )}
                    </ListItem>
                  ))}
                </List>
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
          </Box>
        )}
      </Modal>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};

/* ── Pieces ───────────────────────────────────────────────────────────────── */







export default FoodOrdersPage;

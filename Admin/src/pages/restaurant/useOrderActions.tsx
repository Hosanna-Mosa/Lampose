/* ══════════════════════════════════════════════════════════════════════════
   The moves on an order, and the questions they ask.

   Everything that happens when somebody presses a button on an order — the
   dialogs (cooking time — and who delivers, on a website order — and why it is
   refused), the calls, and what is said about how they went.

   Two screens use it: the Orders page of the console, where an owner who is
   signed in works the queue, and the page behind the link in the "new order"
   WhatsApp, where an owner who is not works one order. They must ask the same
   questions, and the only way two screens stay the same is for there to be one
   of them. What differs is HOW a move reaches the server (the console's session,
   or the link's proof) and what is done once it has, and those are its arguments.
   ══════════════════════════════════════════════════════════════════════════ */
import { useState } from 'react';
import { Ban, CheckCircle2, Send } from 'lucide-react';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Inline } from '../../components/common/atoms/Inline';
import { List } from '../../components/common/atoms/List';
import { ListItem } from '../../components/common/atoms/ListItem';
import { Text } from '../../components/common/atoms/Text';
import { Input } from '../../components/common/atoms/Input';
import { Textarea } from '../../components/common/atoms/Textarea';
import { Field } from '../../components/common/molecules/Field';
import { Modal } from '../../components/common/organisms/Modal';
import type { ToastState } from '../../components/common/organisms/Toast';
import type {
  DeliveryBy,
  FoodOrderStatus,
  OrderMoveResponse,
  RestaurantOrder,
} from '../../api/services/restaurantAdminService';
import { choosesDelivery, deliveryToast, isDelivery, lineLabel, STATUS_LOOK } from './orderLooks';
import { DeliveryPicker } from './orderShared';

/* ══════════════════════════════════════════════════════════════════════════
   The moves, and the dialogs they ask their questions in
   ══════════════════════════════════════════════════════════════════════════ */

export interface MoveExtra {
  reason?: string;
  promisedMinutes?: number;
  /** With an accept: who delivers. */
  deliveryBy?: DeliveryBy;
}

interface OrderActionsConfig {
  /** How a move reaches the server: the console's own session, or the link's proof. */
  setStatus: (
    order: RestaurantOrder,
    status: FoodOrderStatus,
    extra: MoveExtra
  ) => Promise<OrderMoveResponse>;
  setDelivery: (order: RestaurantOrder, by: DeliveryBy) => Promise<OrderMoveResponse>;
  /** A change went through. `order` is the order as the server now has it, when it said. */
  onChanged: (order: RestaurantOrder | null) => void;
  /** What is on screen is out of date — the order moved under us — and should be read again. */
  onStale?: () => void;
  notify: (toast: ToastState) => void;
}

/**
 * Everything that happens when somebody presses a button on an order.
 *
 * Returns `onMove` (start any move — it opens the dialog that move needs, or
 * just makes it), `openAccept` / `openChoose` / `resend` for the entry points
 * that are not a plain move, `busy` (the order number being worked, for a
 * spinner), `anyOpen` (so a screen can stop refreshing itself under a dialog),
 * and `dialogs`, which the screen renders once.
 */
export const useOrderActions = ({
  setStatus,
  setDelivery,
  onChanged,
  onStale,
  notify,
}: OrderActionsConfig) => {
  const [busy, setBusy] = useState<string | null>(null);

  /* The moves that ask a question before they happen. Held as the order plus the
     move, so the dialog knows what it is confirming. */
  const [accepting, setAccepting] = useState<RestaurantOrder | null>(null);
  const [minutes, setMinutes] = useState('20');
  /* Who delivers, in the accept dialog. Empty until the owner picks: there is no
     default, because a default is a decision made for them, and the wrong one
     either sends a WhatsApp nobody meant to send or leaves an order with nobody
     to bring it. */
  const [acceptBy, setAcceptBy] = useState<DeliveryBy | ''>('');
  const [refusing, setRefusing] = useState<RestaurantOrder | null>(null);
  const [reason, setReason] = useState('');
  /* The same question asked of an order that is already accepted. */
  const [choosing, setChoosing] = useState<RestaurantOrder | null>(null);
  const [chooseBy, setChooseBy] = useState<DeliveryBy | ''>('');

  /**
   * Move one order, and say what happened.
   *
   * Every refusal is shown with the server's own sentence rather than a generic
   * one: INVALID_TRANSITION names the state the order is actually in, which is
   * the only useful thing to tell somebody whose button did nothing. The screen
   * is told to reload either way — on success because the order has moved, on
   * INVALID_TRANSITION because what is on screen is out of date.
   */
  const move = async (
    order: RestaurantOrder,
    status: FoodOrderStatus,
    extra: MoveExtra = {}
  ): Promise<OrderMoveResponse> => {
    setBusy(order.orderNumber);
    const res = await setStatus(order, status, extra);
    setBusy(null);

    if (res.success) {
      /* An accept that also chose a delivery says how that went, in the same
         breath — "accepted, and the driver request could not be sent" must not
         read as a plain success. */
      const delivery = res.delivery ? deliveryToast(res.delivery) : null;
      notify({
        tone: delivery ? delivery.tone : 'good',
        message: `${order.orderNumber} — ${STATUS_LOOK[status].label.toLowerCase()}.${
          delivery ? ` ${delivery.message}` : ''
        }`,
      });
      onChanged(res.data);
      return res;
    }

    notify({ tone: 'crit', message: res.message || 'That change could not be saved.' });
    /* The order moved under us, or somebody else moved it. Either way what is on
       screen is wrong and arguing with it helps nobody. */
    if (res.code === 'INVALID_TRANSITION') onStale?.();
    return res;
  };

  const openAccept = (order: RestaurantOrder) => {
    setMinutes(String(order.promisedMinutes || 20));
    setAcceptBy('');
    setAccepting(order);
  };

  const confirmAccept = async () => {
    if (!accepting) return;
    /* A WEBSITE delivery order does not go through without saying who brings it.
       The button is disabled until then; this is the same rule for a keypress.
       An app order asks nothing of the kind — the search for a real driver starts
       by itself once it is accepted. */
    const needsChoice = choosesDelivery(accepting);
    if (needsChoice && !acceptBy) return;
    const parsed = Number(minutes);
    const res = await move(accepting, 'accepted', {
      /* Only sent when it is a real number. The server clamps it to four hours
         and ignores anything that is not positive, so an empty box means "no
         quote" rather than "zero minutes". */
      ...(Number.isFinite(parsed) && parsed > 0 ? { promisedMinutes: parsed } : {}),
      ...(needsChoice && acceptBy ? { deliveryBy: acceptBy } : {}),
    });
    if (res.success) {
      setAccepting(null);
      setMinutes('20');
      setAcceptBy('');
    }
  };

  const confirmRefuse = async () => {
    if (!refusing) return;
    const res = await move(refusing, 'rejected', { reason: reason.trim() });
    if (res.success) {
      setRefusing(null);
      setReason('');
    }
  };

  /**
   * Choose — or change, or resend — who delivers an order that is accepted.
   *
   * For a driver this waits on the WhatsApp, which the server confirms before it
   * answers (a few seconds), so the button shows it is working. A refusal is
   * shown with the server's own sentence; `WRONG_STATE` and
   * `RIDER_ALREADY_ASSIGNED` mean the order moved under us, so the screen is
   * told to read it again.
   */
  const applyDelivery = async (order: RestaurantOrder, by: DeliveryBy): Promise<boolean> => {
    setBusy(order.orderNumber);
    const res = await setDelivery(order, by);
    setBusy(null);

    if (res.success && res.delivery) {
      const t = deliveryToast(res.delivery);
      notify({ tone: t.tone, message: `${order.orderNumber} — ${t.message}` });
      onChanged(res.data);
      return true;
    }
    notify({ tone: 'crit', message: res.message || 'That could not be saved.' });
    if (res.code === 'WRONG_STATE' || res.code === 'RIDER_ALREADY_ASSIGNED') onStale?.();
    return false;
  };

  const openChoose = (order: RestaurantOrder) => {
    setChooseBy(order.deliveryChoice?.method || '');
    setChoosing(order);
  };

  const confirmChoose = async () => {
    if (!choosing || !chooseBy) return;
    if (await applyDelivery(choosing, chooseBy)) {
      setChoosing(null);
      setChooseBy('');
    }
  };

  const onMove = (order: RestaurantOrder, status: FoodOrderStatus) => {
    /* Two of the moves ask something first: accepting quotes a cooking time (and,
       on a website order, says who delivers), and refusing wants a reason the diner
       will be told. The rest — start cooking, food is ready, taken by the delivery
       boy — are unambiguous and happen on the click. "Delivered" is not here at
       all: it is the diner's word, not the restaurant's. */
    if (status === 'accepted') {
      openAccept(order);
      return;
    }
    if (status === 'rejected') {
      setReason('');
      setRefusing(order);
      return;
    }
    move(order, status);
  };

  const dialogs = (
    <>
      {/* ── Accept ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(accepting)}
        onClose={() => setAccepting(null)}
        title={`Accept ${accepting?.orderNumber ?? ''}`}
        description={
          !accepting || !isDelivery(accepting)
            ? 'How long until the food is ready? The customer is collecting it from your counter.'
            : choosesDelivery(accepting)
              ? 'How long until the food is ready, and who is delivering it?'
              : 'How long until the food is ready? A Lampose rider is called straight away, sized to this answer.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccepting(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              loading={busy === accepting?.orderNumber}
              disabled={Boolean(accepting && choosesDelivery(accepting) && !acceptBy)}
              onClick={confirmAccept}
            >
              {acceptBy === 'driver' ? 'Accept and request driver' : 'Accept order'}
            </Button>
          </>
        }
      >
        <Box className="space-y-4">
          <Field
            label="Minutes until ready"
            hint={
              accepting && choosesDelivery(accepting)
                ? 'Shown to the customer, and sent with the delivery request. Leave it blank if you cannot say.'
                : accepting && isDelivery(accepting)
                  ? 'Every rider who can reach you by then is offered the job at once. Leave it blank if you cannot say.'
                  : 'Shown to the customer. Leave it blank if you cannot say.'
            }
          >
            <Input
              type="number"
              min={1}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="20"
            />
          </Field>
          {/* Only a WEBSITE delivery order asks. A counter pickup has nobody to
              deliver it, and an app order gets a real driver found for it. */}
          {/* Not a `Field`: that wraps its children in a <label>, and a label
              around several buttons forwards a click on its own text to the
              first of them — a tap on the hint would choose "our own person". */}
          {accepting && choosesDelivery(accepting) && (
            <Box>
              <Text className="block text-label text-ink-2 mb-1.5">Who delivers this order?</Text>
              <DeliveryPicker value={acceptBy} onChange={setAcceptBy} />
              <Text className="text-label text-ink-3 mt-1.5">
                Either way, the customer is told a driver has been assigned.
              </Text>
            </Box>
          )}
          {accepting && (
            <Box className="rounded-panel border border-line bg-surface-subtle p-3">
              <Text className="text-label uppercase text-ink-3 mb-1.5">The order</Text>
              <List className="space-y-1 list-none m-0 p-0">
                {(accepting.lines || []).map((line, i) => (
                  <ListItem key={`${line.productId}-${i}`} className="text-sm text-ink-2">
                    {lineLabel(line)}
                    {line.note ? <Inline className="text-ink-3"> — {line.note}</Inline> : null}
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Box>
      </Modal>

      {/* ── Choose (or change) who delivers, after the accept ──────────── */}
      <Modal
        open={Boolean(choosing)}
        onClose={() => setChoosing(null)}
        title={`Delivery for ${choosing?.orderNumber ?? ''}`}
        description="Who brings this order to the customer?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setChoosing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={chooseBy === 'driver' ? Send : CheckCircle2}
              loading={busy === choosing?.orderNumber}
              disabled={!chooseBy}
              onClick={confirmChoose}
            >
              {chooseBy === 'driver'
                ? choosing?.deliveryChoice?.method === 'driver'
                  ? 'Send the request again'
                  : 'Request a driver'
                : 'We will deliver it'}
            </Button>
          </>
        }
      >
        <Box className="space-y-3">
          <DeliveryPicker value={chooseBy} onChange={setChooseBy} />
          {choosing?.deliveryChoice?.method === 'driver' &&
            choosing.deliveryChoice.request &&
            !choosing.deliveryChoice.request.ok && (
              <Text className="text-label text-crit">
                The last request did not go out
                {choosing.deliveryChoice.request.error
                  ? `: ${choosing.deliveryChoice.request.error}`
                  : '.'}
              </Text>
            )}
          {choosing?.deliveryChoice?.method === 'driver' && chooseBy === 'self' && (
            <Text className="text-label text-ink-3">
              The delivery desk is told to stand down.
            </Text>
          )}
          <Text className="text-label text-ink-3">
            Either way, the customer is told a driver has been assigned.
          </Text>
        </Box>
      </Modal>

      {/* ── Refuse ─────────────────────────────────────────────────────── */}
      <Modal
        open={Boolean(refusing)}
        onClose={() => setRefusing(null)}
        title={`Refuse ${refusing?.orderNumber ?? ''}`}
        description="The diner is told, any rider already assigned is released, and money already paid is flagged for a refund."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefusing(null)}>
              Keep the order
            </Button>
            <Button
              variant="danger"
              icon={Ban}
              loading={busy === refusing?.orderNumber}
              onClick={confirmRefuse}
            >
              Refuse it
            </Button>
          </>
        }
      >
        <Field
          label="Why?"
          hint="The diner sees this. “Out of paneer” is more use than “unavailable”."
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="We have run out of one of these items."
          />
        </Field>
      </Modal>
    </>
  );

  return {
    busy,
    anyOpen: Boolean(accepting || refusing || choosing),
    onMove,
    openAccept,
    openChoose,
    resend: (order: RestaurantOrder) => applyDelivery(order, 'driver'),
    dialogs,
  };
};

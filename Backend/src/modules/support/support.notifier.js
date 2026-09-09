/* ══════════════════════════════════════════════════════════════════════════
   Telling both sides of a support thread that something happened.

   One file, because a support message has to reach up to three places at once
   and the list of them is not obvious from any single caller:

     the thread          `ticket:<reference>` — whoever has this conversation
                         open, on either side
     the requester       `customer:<id>` / `driver:<id>` / `restaurant:<id>` —
                         the person who filed it, wherever they are in their
                         app, so a reply badges the Support tab from the home
                         screen
     the queue           `support` — every administrator watching the console,
                         so a new ticket appears without a refresh

   Scattering those three emits across the two controllers is how one of them
   gets forgotten, and the symptom is invisible: a reply that reaches the open
   thread but never badges the tab, so the rider sees it only if they happened
   to be looking.

   ## Why the requester's room AND the thread room

   They overlap and that is deliberate. A diner with the thread open is in both
   and socket.io de-duplicates, so nobody is told twice. A diner who closed the
   thread ten minutes ago is only in `customer:<id>`, and they are exactly the
   person a reply most needs to reach.

   ## Nothing here can fail a write

   Every function returns void and swallows its own errors, the same contract
   `realtime.emit` and `push.js` already keep. A support reply that saved and
   then threw on the way out would be shown to the person who typed it as "that
   did not send", and they would send it again — so the failure mode of a down
   socket is a slower message, never a duplicated one.

   ## The payloads are summaries, not documents

   A list row gets `toAdminSummary()`; a bubble gets the one message. Pushing
   the whole thread on every keystroke-sized event would put a 4000-character
   body on the wire twenty times in a conversation, and the receiving screen
   already has the rest of it.
   ══════════════════════════════════════════════════════════════════════════ */
const realtime = require('../../infrastructure/realtime/realtime');

/**
 * The room the requester of a ticket is in, whichever app they use.
 *
 * `requester.kind` is the same word `realtime.js` derives from a token's `typ`
 * claim, which is what makes this a lookup rather than a translation table.
 */
const requesterRoom = (ticket) => {
  const requester = (ticket && ticket.requester) || {};
  const id = requester.id || ticket.customerId;
  if (!id) return null;

  if (requester.kind === 'driver') return realtime.rooms.driver(id);
  if (requester.kind === 'restaurant') return realtime.rooms.restaurant(id);
  if (requester.kind === 'partner') return realtime.rooms.partner(id);
  /* `customer`, and also every legacy row — nothing but a diner could have
     written one without a `requester`. */
  return realtime.rooms.customer(id);
};

/**
 * The SECOND party's room, where there is one — a property owner reading a
 * ticket a student filed. `requesterRoom` above answers "who filed this";
 * this answers "who else names them", and the two are never the same room on
 * one ticket, so both firing costs nothing extra (socket.io does not
 * double-deliver to one socket that happens to be in both anyway).
 */
const linkedRoom = (ticket) => (
  ticket && ticket.linkedPartnerId ? realtime.rooms.partner(ticket.linkedPartnerId) : null
);


/* ══════════════════════════════════════════════════════════════════════════
   The push half.

   Everything above is socket-only, and a socket reaches a phone that has the
   app open. A support reply is the one message in this product most likely to
   arrive when the app is CLOSED: a student raised a deposit dispute at
   midnight and the team answered at ten the next morning. Without a push,
   they find the answer only by opening Support again — which, for somebody
   waiting on money, means opening it every hour.

   So a reply from the team is also pushed to whichever handset the requester
   registered, and to the linked owner on a student's property ticket. The
   requester's OWN message is never pushed back to them.

   ## Looking the account up

   `requester.kind` says which collection; `requester.id` is that audience's
   public id — `partnerId`, `customerId`, `driverId`, `restaurantId` — which
   is what each support router put in `req.support`. Every one of those models
   carries `devices[]` from its own device route.

   ## Never able to fail a reply

   Wrapped like the socket emits: a push that throws — no token, Expo down,
   the model missing — is logged and dropped. The reply already saved.
   ══════════════════════════════════════════════════════════════════════════ */
const push = require('../../infrastructure/push/push');

const MODEL_FOR = {
  partner: () => ({ Model: require('../partners/partner.model'), key: 'partnerId' }),
  customer: () => ({ Model: require('../customers/customer.model'), key: 'customerId' }),
  driver: () => ({ Model: require('../drivers/driver.model'), key: 'driverId' }),
  restaurant: () => ({ Model: require('../foodpartners/foodRestaurant.model'), key: 'restaurantId' }),
};

const pushTo = async (kind, id, message) => {
  if (!id) return null;
  const pick = MODEL_FOR[kind] || MODEL_FOR.customer;
  try {
    const { Model, key } = pick();
    const account = await Model.findOne({ [key]: String(id) }).select('devices').lean();
    const tokens = ((account && account.devices) || []).map((d) => d.token).filter(Boolean);
    if (!tokens.length) return { sent: 0, reason: 'NO_DEVICES' };
    return await push.sendPush(tokens, { ...message, channelId: 'support' });
  } catch (error) {
    console.error(`[support] push to ${kind} ${id} failed:`, error.message);
    return null;
  }
};

const requesterOf = (ticket) => {
  const requester = (ticket && ticket.requester) || {};
  return { kind: requester.kind || 'customer', id: requester.id || ticket.customerId || null };
};

const preview = (text, n = 120) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * The team answered. Push it to the person waiting.
 *
 * Only a `support` author — the requester typing into their own thread must
 * not be pushed their own words, and a `system` line ("status changed") is
 * not speech.
 */
const pushReply = (ticket, message) => {
  if (!ticket || !message || message.author !== 'support') return;
  const who = requesterOf(ticket);
  const data = { kind: 'support.reply', reference: ticket.reference, ticketKind: ticket.kind };

  pushTo(who.kind, who.id, {
    title: `${message.authorName || 'Lampose Support'} replied`,
    body: `${ticket.subject ? `${ticket.subject} · ` : ''}${preview(message.body)}`,
    data,
  }).catch(() => {});

  /* The owner named on a student's property ticket reads the thread too. */
  if (ticket.linkedPartnerId) {
    pushTo('partner', ticket.linkedPartnerId, {
      title: 'Lampose replied on a guest’s ticket',
      body: `${ticket.subject ? `${ticket.subject} · ` : ''}${preview(message.body)}`,
      data,
    }).catch(() => {});
  }
};

/** The queue closed it. Worth a push: the person can stop waiting. */
const pushOutcome = (ticket) => {
  if (!ticket || !['resolved', 'closed'].includes(ticket.status)) return;
  const who = requesterOf(ticket);
  pushTo(who.kind, who.id, {
    title: ticket.status === 'resolved' ? 'Your ticket was resolved' : 'Your ticket was closed',
    body: `${ticket.subject || 'Support'} — open it to see the outcome${ticket.status === 'resolved' ? ', or reply if it is not sorted' : ''}.`,
    data: { kind: 'support.status', reference: ticket.reference, status: ticket.status },
  }).catch(() => {});
};

/** The compact shape every support event carries, so a list row can redraw. */
const rowOf = (ticket) => {
  try {
    return ticket.toAdminSummary();
  } catch {
    /* A lean() document, or one from a path that has not hydrated methods.
       A partial row still lets a screen refetch; throwing would not. */
    return {
      reference: ticket.reference,
      kind: ticket.kind,
      status: ticket.status,
      subject: ticket.subject,
      lastActivityAt: ticket.lastActivityAt,
    };
  }
};

/** One message, as a bubble. */
const bubbleOf = (message) => (message ? {
  id: String(message._id || ''),
  author: message.author,
  authorName: message.authorName || '',
  body: message.body,
  at: message.at,
} : null);

/**
 * A ticket was just filed.
 *
 * Goes to the queue and to the requester. NOT to `ticket:<reference>` — nobody
 * can be watching a thread that did not exist a moment ago, and emitting into
 * an empty room is a wasted round trip on the hot path of somebody pressing
 * "send" on a complaint.
 */
const ticketOpened = (ticket) => {
  if (!ticket) return;
  try {
    const payload = { ticket: rowOf(ticket) };
    realtime.toSupport('support_ticket_opened', payload);

    const room = requesterRoom(ticket);
    if (room) realtime.toRoom(room, 'support_ticket_updated', payload);

    const linked = linkedRoom(ticket);
    if (linked) realtime.toRoom(linked, 'support_ticket_updated', payload);
  } catch {
    /* See the header: a notifier never fails a write. */
  }
};

/**
 * Somebody said something — either side.
 *
 * The one event both apps and the console listen for. It carries the message
 * AND the updated row, because the two screens that receive it need different
 * halves: an open thread appends the bubble, a list redraws the row, and
 * sending only one of them would make the other refetch.
 */
const messageAdded = (ticket, message) => {
  if (!ticket) return;
  try {
    const payload = {
      reference: ticket.reference,
      message: bubbleOf(message),
      ticket: rowOf(ticket),
    };

    realtime.toRoom(realtime.rooms.ticket(ticket.reference), 'support_message', payload);
    realtime.toSupport('support_message', payload);

    const room = requesterRoom(ticket);
    if (room) realtime.toRoom(room, 'support_message', payload);

    const linked = linkedRoom(ticket);
    if (linked) realtime.toRoom(linked, 'support_message', payload);
  } catch {
    /* As above. */
  }

  /* After the sockets, and never able to fail them. */
  pushReply(ticket, message);
};

/**
 * The queue moved it — a status, an outcome, an assignment, a priority.
 *
 * Separate from `messageAdded` because it is not speech and the app draws it
 * differently: a status change redraws a chip and a row, it does not add a
 * bubble. Sending it as a message would put "status changed to resolved" into
 * a conversation as though a person had said it.
 */
const ticketUpdated = (ticket) => {
  if (!ticket) return;
  try {
    const payload = { reference: ticket.reference, ticket: rowOf(ticket) };

    realtime.toRoom(realtime.rooms.ticket(ticket.reference), 'support_ticket_updated', payload);
    realtime.toSupport('support_ticket_updated', payload);

    const room = requesterRoom(ticket);
    if (room) realtime.toRoom(room, 'support_ticket_updated', payload);

    const linked = linkedRoom(ticket);
    if (linked) realtime.toRoom(linked, 'support_ticket_updated', payload);
  } catch {
    /* As above. */
  }

  pushOutcome(ticket);
};

module.exports = {
  ticketOpened, messageAdded, ticketUpdated, requesterRoom, linkedRoom,
};

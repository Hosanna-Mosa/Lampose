/* ══════════════════════════════════════════════════════════════════════════
   Telling people about a table booking.

   The same two channels a food order uses, in the same order and for the same
   reason (see `foodOrder.notifier.js`): the live socket first, because a
   restaurant's tablet is awake on the counter and needs nothing but its
   session; then a push, for a handset that is asleep.

     restaurant  `table_booking_requested` / `table_booking_updated` into
                 `restaurant:<id>`, and a push on the order channel with its
                 alert sound — a request has fifteen minutes to be answered.
     diner       `table_booking_updated` into `customer:<id>`, and a push.

   Every function here resolves and never throws: a booking that is written is
   real whether or not anybody's phone rang.
   ══════════════════════════════════════════════════════════════════════════ */
const { sendPush, pushReady } = require('../../infrastructure/push/push');
const realtime = require('../../infrastructure/realtime/realtime');
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const { clockLabel, dayLabel } = require('./dineIn.rules');

const ORDER_CHANNEL = 'food-orders';
const BADGE = '🍽️  [Dine-in]';

const Customer = () => require('../customers/customer.model'); // eslint-disable-line global-require

const when = (booking) => `${dayLabel(booking.date)} · ${clockLabel(booking.time)}`;
const guests = (n) => `${n} guest${n === 1 ? '' : 's'}`;
/** "Table A3 · " — or nothing, for a booking made before tables had numbers. */
const tableOf = (booking) => (booking.tableNumber ? `Table ${booking.tableNumber} · ` : '');

/** Live event to the restaurant's room. Never throws. */
const live = (kind, id, event, data) => {
  try {
    if (kind === 'restaurant') return realtime.toRestaurant(id, event, data) === true;
    return realtime.toCustomer(id, event, data) === true;
  } catch (error) {
    return false;
  }
};

const pushRestaurant = async (restaurantId, message) => {
  if (!pushReady()) return { sent: 0, reason: 'push is not configured' };
  try {
    const restaurant = await FoodRestaurant.findOne({ restaurantId }).select('+devices').lean();
    const tokens = (restaurant?.devices || []).map((d) => d.token).filter(Boolean);
    if (!tokens.length) return { sent: 0, reason: 'no handset registered' };
    return await sendPush(tokens, message);
  } catch (error) {
    console.error(`${BADGE} restaurant push failed: ${error.message}`);
    return { sent: 0, reason: error.message };
  }
};

const pushCustomer = async (customerId, message) => {
  if (!pushReady()) return { sent: 0, reason: 'push is not configured' };
  try {
    const Model = Customer();
    const account = await Model.findOne({ customerId }).select('devices').lean();
    const tokens = (account?.devices || []).map((d) => d.token).filter(Boolean);
    if (!tokens.length) return { sent: 0, reason: 'no handset registered' };
    const result = await sendPush(tokens, message);
    if (result && result.invalid && result.invalid.length) {
      await Model.updateOne({ customerId }, { $pull: { devices: { token: { $in: result.invalid } } } });
    }
    return result;
  } catch (error) {
    console.error(`${BADGE} customer push failed: ${error.message}`);
    return { sent: 0, reason: error.message };
  }
};

/** The slim shape a live event carries — enough to refresh a list. */
const eventOf = (booking) => ({
  reference: booking.reference,
  status: booking.status,
  date: booking.date,
  time: booking.time,
  partySize: booking.partySize,
  tableNumber: booking.tableNumber || null,
  guestName: booking.guestName,
  respondBy: booking.respondBy,
});

/** A new request: ring the restaurant. */
async function notifyRestaurantOfRequest(booking) {
  const sent = live('restaurant', booking.restaurantId, 'table_booking_requested', eventOf(booking));
  const outcome = await pushRestaurant(booking.restaurantId, {
    title: `Table request · ${tableOf(booking)}${guests(booking.partySize)}`,
    body: `${when(booking)} · ${booking.guestName || 'A diner'} — answer within 15 minutes`,
    data: { kind: 'table_booking', reference: booking.reference, restaurantId: booking.restaurantId },
    sound: 'default',
    channelId: ORDER_CHANNEL,
    priority: 'high',
  });
  console.log(
    `${BADGE} ${booking.reference} requested at ${booking.restaurantId}`
    + ` · live ${sent ? 'sent' : 'not sent'} · push ${outcome?.sent ?? 0}`,
  );
}

/** The diner cancelled: tell the restaurant. */
async function notifyRestaurantOfCancel(booking) {
  live('restaurant', booking.restaurantId, 'table_booking_updated', eventOf(booking));
  await pushRestaurant(booking.restaurantId, {
    title: `Booking cancelled · ${booking.reference}`,
    body: `${booking.guestName || 'The diner'} cancelled ${when(booking)} (${guests(booking.partySize)}).`,
    data: { kind: 'table_booking', reference: booking.reference, restaurantId: booking.restaurantId },
    channelId: ORDER_CHANNEL,
  });
}

/** Something about this booking changed for the diner. */
async function notifyCustomer(booking, event) {
  live('customer', booking.customerId, 'table_booking_updated', eventOf(booking));
  const name = booking.restaurantName || 'The restaurant';
  const messages = {
    confirmed: {
      title: `Table confirmed at ${name}`,
      body: `${when(booking)} · ${tableOf(booking)}${guests(booking.partySize)} · Ref ${booking.reference}`,
    },
    declined: {
      title: `${name} couldn't take your booking`,
      body: booking.reason || 'Try another time, or another restaurant.',
    },
    expired: {
      title: `No answer from ${name}`,
      body: 'Your table request expired. Try another time, or another restaurant.',
    },
    cancelled: {
      title: `${name} cancelled your table`,
      body: booking.reason || `${when(booking)} is no longer booked.`,
    },
    reminder: {
      title: `Your table at ${name} is at ${clockLabel(booking.time)}`,
      body: `${tableOf(booking)}${guests(booking.partySize)} · Ref ${booking.reference}`,
    },
  };
  const message = messages[event];
  if (!message) return;
  await pushCustomer(booking.customerId, {
    ...message,
    data: { kind: 'table_booking', reference: booking.reference },
  });
}

module.exports = {
  notifyRestaurantOfRequest,
  notifyRestaurantOfCancel,
  notifyCustomer,
};

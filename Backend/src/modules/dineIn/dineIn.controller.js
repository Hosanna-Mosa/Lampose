/* ══════════════════════════════════════════════════════════════════════════
   Dine-in over HTTP — mounted on `/api/v2/food-partners` (see the routes).

     public      GET  /restaurants/:restaurantId/dine-in/slots?date=&guests=
     diner       POST /table-bookings
                 GET  /table-bookings
                 GET  /table-bookings/:reference
                 POST /table-bookings/:reference/cancel
     restaurant  GET  /me/dine-in                 the settings form
                 PUT  /me/dine-in                 save it
                 PATCH /me/dine-in/paused         { paused }
                 POST /me/dine-in/blocks          { date, time? } close a day / mark a slot full
                 POST /me/dine-in/blocks/remove   { date, time? }
                 GET  /me/table-bookings          requests, upcoming, past
                 POST /me/table-bookings/:reference/:action
                      action = accept | decline | cancel | arrived | no-show

   Replies use the food module's envelope: `{ success: true, data }`, or
   `{ success: false, code, message }` with the sentence to show.
   ══════════════════════════════════════════════════════════════════════════ */
const service = require('./tableBooking.service');

const { DineInError } = service;

const fail = (res, status, code, message, extra = {}) => res.status(status).json({
  success: false, code, message, error: message, ...extra,
});

/** Wrap a handler: a DineInError becomes its own reply, anything else goes on. */
const handle = (fn) => async (req, res, next) => {
  try {
    return await fn(req, res);
  } catch (error) {
    if (error instanceof DineInError) return fail(res, error.status, error.code, error.message, error.extra);
    console.error('🍽️  [Dine-in] request failed:', error.message);
    return next(error);
  }
};

/* ── Public ──────────────────────────────────────────────────────────────── */

const getSlots = handle(async (req, res) => {
  const data = await service.availability({
    restaurantId: req.params.restaurantId,
    date: req.query.date,
    guests: req.query.guests,
    /* One of the slots: the answer then lists the tables free at that time. */
    time: req.query.time,
  });
  return res.json({ success: true, data });
});

/* ── The diner ───────────────────────────────────────────────────────────── */

const bookTable = handle(async (req, res) => {
  const booking = await service.createBooking({ customer: req.customer, body: req.body || {} });
  return res.status(201).json({ success: true, data: service.customerView(booking) });
});

const listMyTableBookings = handle(async (req, res) => {
  const data = await service.listForCustomer(req.customer.customerId);
  return res.json({ success: true, count: data.length, data });
});

const getMyTableBooking = handle(async (req, res) => {
  const booking = await service.findForCustomer(req.customer.customerId, req.params.reference);
  return res.json({ success: true, data: service.customerView(booking) });
});

const cancelMyTableBooking = handle(async (req, res) => {
  const booking = await service.cancelByCustomer({
    customerId: req.customer.customerId,
    reference: req.params.reference,
    reason: req.body && req.body.reason,
  });
  return res.json({ success: true, data: service.customerView(booking) });
});

/* ── The restaurant ──────────────────────────────────────────────────────── */

const getDineInSettings = handle(async (req, res) => res.json({
  success: true, data: service.settingsView(req.foodPartner),
}));

const saveDineInSettings = handle(async (req, res) => {
  const data = await service.saveSettings(req.foodPartner, req.body || {});
  console.log(`🍽️  [Dine-in] settings saved · ${req.foodPartner.restaurantId} · ${data.enabled ? 'on' : 'off'}`);
  return res.json({ success: true, data });
});

const setDineInPaused = handle(async (req, res) => {
  const data = await service.setPaused(req.foodPartner, req.body && req.body.paused === true);
  return res.json({ success: true, data });
});

const blockDineIn = handle(async (req, res) => {
  const { settings, cancelled } = await service.block(req.foodPartner, req.body || {});
  return res.json({ success: true, data: settings, cancelled });
});

const unblockDineIn = handle(async (req, res) => {
  const data = await service.unblock(req.foodPartner, req.body || {});
  return res.json({ success: true, data });
});

const listRestaurantTableBookings = handle(async (req, res) => {
  const data = await service.listForRestaurant(req.foodPartner.restaurantId);
  return res.json({ success: true, data });
});

const actOnTableBooking = handle(async (req, res) => {
  const booking = await service.restaurantAction({
    restaurantId: req.foodPartner.restaurantId,
    reference: req.params.reference,
    action: req.params.action,
    reason: req.body && req.body.reason,
  });
  return res.json({ success: true, data: service.partnerView(booking) });
});

module.exports = {
  getSlots,
  bookTable,
  listMyTableBookings,
  getMyTableBooking,
  cancelMyTableBooking,
  getDineInSettings,
  saveDineInSettings,
  setDineInPaused,
  blockDineIn,
  unblockDineIn,
  listRestaurantTableBookings,
  actOnTableBooking,
};

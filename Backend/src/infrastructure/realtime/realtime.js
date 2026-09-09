/* ══════════════════════════════════════════════════════════════════════════
   The socket layer — the only thing in this process that pushes.

   Everything else here answers a question it was asked. This pushes: a rider
   has fifteen seconds to accept an offer, and fifteen seconds is shorter than
   any polling interval a phone can afford to run all day. So the delivery
   flow — and only the delivery flow — gets a socket.

   ## Six rooms, and what may enter each

   A socket joins exactly the rooms its OWN token earns it. Nothing a client
   sends decides which room it is in; the handshake token does.

     driver:<driverId>        one rider's offers and cancellations
     customer:<customerId>    one diner's order updates
     restaurant:<restaurantId> one kitchen's queue
     order:<orderNumber>      the three parties to one order, plus nobody else
     ticket:<reference>       the two parties to one support thread
     support                  every administrator working the support queue

   The two rooms worth being careful about are the ones with GUESSABLE names —
   an order number is six digits, a support reference is six characters.
   `track_order` and `track_ticket` are therefore not "join whatever you asked
   for": the server reads the document and joins the socket only if its
   identity is a party to it.

   ## Support is why an ADMIN can hold a socket

   The delivery flow needs three identities and deliberately refused staff
   tokens. Support needs a fourth, because a support conversation has two ends
   and one of them is a person in the console — a queue that could only be read
   by polling would make every reply arrive up to a poll-interval late in a
   medium where the other party is watching a typing area. The admin branch of
   `identify` is the only one that costs a database read, and it is the only
   one whose failure mode is somebody else's private thread.

   ## Nothing here is required for correctness

   Every state change is written to `food_orders` FIRST and emitted second, and
   every screen that reads a socket event can also read the same fact from an
   HTTP route. A rider whose socket is down still sees the offer through
   `GET /me/offer`; a kitchen still sees the order on its twenty-second poll.
   That is not belt-and-braces for its own sake — it is what lets this file
   degrade instead of failing.

   ## Which is why socket.io is an OPTIONAL dependency

   `require('socket.io')` is in a try/catch. If the package is not installed —
   a deployment that has not run `npm install` since this landed — the module
   reports it once at boot and every emit becomes a no-op. The flow still
   works over HTTP, more slowly. This is the same rule the rest of the
   codebase follows for Mongo, SMS, Twilio and Razorpay: a missing dependency
   degrades loudly on the affected path and takes nothing else down with it.

   ## Auth, and why it is not the HTTP middleware

   The handshake carries `auth.token` — the same bearer token the app already
   holds. It is verified here rather than by `requireDriver`/`requireCustomer`
   because those are Express middleware and a websocket handshake is not an
   Express request. What IS shared is the `typ` claim: this file trusts the
   same claim the five HTTP guards trust, so a customer token cannot join a
   driver room here any more than it can read a driver route there.

   The console's token is the exception that proves it: it carries NO `typ`,
   so it cannot be recognised by a claim, and the admin branch goes to the
   `admins` collection to check the account exists and is still Active — the
   same two questions `verifyAdminToken.middleware.js` asks on every request.
   ══════════════════════════════════════════════════════════════════════════ */
const jwt = require('jsonwebtoken');

const config = require('../../config/env');

/* Loaded optionally — see the header. `null` means "no realtime on this
   deployment", which every function below is written to survive. */
let SocketServer = null;
let loadProblem = null;
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  ({ Server: SocketServer } = require('socket.io'));
} catch (error) {
  loadProblem = 'socket.io is not installed — run `npm install` in Backend/';
}

/** The one server instance, set by `attachRealtime` at boot. */
let io = null;

const BADGE = '🔌 [realtime]';

/* The six token types this process issues. Four of them have business on a
   socket: a rider, a diner, a kitchen and — as of the stay side gaining a
   live line — a Stay Partner owner. Staff tokens verify against the same
   secret and are deliberately not listed. */
const ROOM_OF_TYPE = {
  driver: (claims) => `driver:${claims.sub}`,
  customer: (claims) => `customer:${claims.sub}`,
  foodpartner: (claims) => `restaurant:${claims.sub}`,
  /* `claims.sub` on a partner token is `partner.partnerId` — see
     `signPartnerToken` in partnerAuth.middleware.js — which is what makes
     this the same id `stayRequest.notifier.js` and `support.notifier.js`
     address when they emit to an owner. */
  partner: (claims) => `partner:${claims.sub}`,
};

const KIND_OF_TYPE = {
  driver: 'driver',
  customer: 'customer',
  foodpartner: 'restaurant',
  partner: 'partner',
};

/** Rooms, spelled in one place so an emitter and a joiner cannot disagree. */
const rooms = {
  driver: (driverId) => `driver:${driverId}`,
  customer: (customerId) => `customer:${customerId}`,
  restaurant: (restaurantId) => `restaurant:${restaurantId}`,
  partner: (partnerId) => `partner:${partnerId}`,
  order: (orderNumber) => `order:${orderNumber}`,

  /*
   * One support thread — the requester and whichever administrator has it
   * open. Guarded exactly like `order:`, and for a stronger reason: an order
   * number is six digits and a support reference is six characters, but a
   * support thread contains an allegation, a phone number and sometimes a
   * bank complaint. `track_ticket` reads the document and checks the asker is
   * a party to it; asking for the room is not being let into it.
   */
  ticket: (reference) => `ticket:${reference}`,
};

/*
 * The console's queue — every signed-in administrator.
 *
 * A single shared room rather than one per administrator, because the queue is
 * shared work: a ticket arriving is news to whoever is looking, not to one
 * named person. Joined automatically by any socket that authenticates as an
 * admin, which is the only kind of socket that can be in it.
 *
 * Support staff are the one audience allowed a firehose, and it is worth being
 * explicit that this IS one: every ticket from every app, including safety
 * reports. That is the job.
 */
const SUPPORT_ROOM = 'support';

/**
 * Read and check a handshake token.
 *
 * Returns `{ kind, id }` or null. Null is not an error the client is told
 * about in detail — an unauthenticated socket is simply disconnected, and the
 * app reconnects with a fresh token when its session refreshes.
 */
/* Which collection holds a token type's session version. Only the two
   stay-side identities carry one today; the other two pass through. */
const SESSION_MODEL = {
  customer: () => [require('../../modules/customers/customer.model'), 'customerId'],
  partner: () => [require('../../modules/partners/partner.model'), 'partnerId'],
};

const sessionStillValid = async (claims) => {
  const pick = SESSION_MODEL[claims.typ];
  if (!pick) return true;
  try {
    const [Model, key] = pick();
    const doc = await Model.findOne({ [key]: String(claims.sub) }).select('status sessionVersion').lean();
    return Boolean(doc) && doc.status !== 'blocked' && (doc.sessionVersion || 0) === (claims.ver || 0);
  } catch {
    return false;
  }
};

const identify = async (token) => {
  if (!token || !config.auth.configured) return null;
  let claims;
  try {
    claims = jwt.verify(String(token).replace(/^Bearer\s+/i, ''), config.auth.jwtSecret);
  } catch {
    /* Expired or forged. Telling the two apart would only help somebody
       probing, so both are simply "not a socket we serve". */
    return null;
  }

  const kind = KIND_OF_TYPE[claims.typ];
  if (kind && claims.sub) {
    /* The two stay-side identities carry a session version (see
       iam/session.controller.js). One indexed read at the handshake — not per
       event — so that "sign out everywhere" also closes the live line. */
    if (!(await sessionStillValid(claims))) return null;
    return { kind, id: String(claims.sub), room: ROOM_OF_TYPE[claims.typ](claims) };
  }

  /*
   * An administrator, for the support queue.
   *
   * The console's token is `typ: 'admin'` (admins/adminToken.js). It is not
   * in the map above because this branch does not trust the shape — it goes
   * and LOOKS: the account must still exist, must still be Active, and the
   * token's `ver` must be the account's current `sessionVersion`, exactly as
   * `verifyAdminToken.middleware.js` requires on every HTTP request. A
   * suspended or demoted administrator whose browser tab is still open gets
   * no socket.
   *
   * A token with no `typ` at all is a console token from before the upgrade
   * and is refused, as the HTTP guard refuses it — one sign-in fixes both.
   */
  if (claims.typ === 'admin' && claims.id) {
    try {
      // eslint-disable-next-line global-require
      const Admin = require('../../modules/admins/admin.model');
      const admin = await Admin.findById(claims.id).select('name role status sessionVersion');
      if (!admin || admin.status !== 'Active') return null;
      if ((claims.ver || 0) !== (admin.sessionVersion || 0)) return null;
      return {
        kind: 'admin',
        id: String(admin._id),
        name: admin.name || '',
        role: admin.role || '',
        room: SUPPORT_ROOM,
      };
    } catch {
      /* Mongo down, or a malformed id that CastError'd. Either way this socket
         cannot be attributed, and an unattributable socket is refused. */
      return null;
    }
  }

  /* A v2 staff token, or anything else. Not a socket we serve. */
  return null;
};

/**
 * May this identity watch this order?
 *
 * Read from the order document, never from the request. The customer on it,
 * the restaurant on it, and the rider currently assigned to it — that is the
 * whole list, and it is re-read on every join so a rider who has been
 * reassigned off an order loses the room on their next reconnect.
 */
const isPartyTo = (order, who) => {
  if (!order || !who) return false;
  if (who.kind === 'customer') return order.customerId && order.customerId === who.id;
  if (who.kind === 'restaurant') return order.restaurantId === who.id;
  if (who.kind === 'driver') return !!(order.delivery && order.delivery.driverId === who.id);
  return false;
};

/**
 * Attach the socket server to the HTTP server server.js already listens on.
 *
 * One port, one process — not a second listener. `path` is left at socket.io's
 * default so the driver app's existing client needs no configuration, and the
 * nginx in `deploy/` needs one `proxy_set_header Upgrade` block rather than a
 * second upstream.
 */
const attachRealtime = (httpServer, { corsOrigin } = {}) => {
  if (!SocketServer) {
    console.warn(`${BADGE} disabled — ${loadProblem}. The delivery flow falls back to polling.`);
    return null;
  }

  io = new SocketServer(httpServer, {
    /* The apps are React Native and send no Origin header, so this only ever
       matters for `expo start --web`. The callback mirrors server.js's rule
       rather than restating a list that would drift from it. */
    cors: { origin: corsOrigin || true, credentials: true },
    /* Both transports. A rider on a train loses websockets and keeps polling;
       refusing the fallback would drop exactly the people who need the offer
       to arrive most. */
    transports: ['websocket', 'polling'],
    pingInterval: 20000,
    pingTimeout: 25000,
  });

  io.on('connection', async (socket) => {
    /* Awaited, because an administrator's identity costs a database read —
       see `identify`. The three app identities still resolve without one. */
    const who = await identify(socket.handshake.auth && socket.handshake.auth.token);

    if (!who) {
      /* Disconnected rather than left in a lobby. A socket that cannot be
         attributed can be sent nothing and can be trusted with nothing, so
         holding it open only costs a file descriptor. */
      socket.emit('unauthorised', { message: 'This session is not valid for realtime updates.' });
      socket.disconnect(true);
      return;
    }

    socket.data.who = who;
    socket.join(who.room);
    console.log(`${BADGE} ${who.kind} ${who.id} connected (${socket.id})`);

    /*
     * Watching one order.
     *
     * The client sends a number; the server decides. See the header — the
     * order room is the only guessable one, so membership is checked against
     * the document rather than granted on request.
     */
    socket.on('track_order', async (payload, ack) => {
      const orderNumber = String(
        (payload && (payload.orderNumber || payload.orderId)) || payload || '',
      ).trim().toUpperCase();
      if (!orderNumber) return;

      try {
        // eslint-disable-next-line global-require
        const FoodOrder = require('../../modules/foodpartners/foodOrder.model');
        const order = await FoodOrder.findOne({ orderNumber })
          .select('orderNumber customerId restaurantId delivery.driverId')
          .lean();

        if (!isPartyTo(order, who)) {
          if (typeof ack === 'function') ack({ ok: false, reason: 'NOT_A_PARTY' });
          return;
        }
        socket.join(rooms.order(orderNumber));
        if (typeof ack === 'function') ack({ ok: true });
      } catch (error) {
        console.warn(`${BADGE} track_order(${orderNumber}) failed: ${error.message}`);
        if (typeof ack === 'function') ack({ ok: false, reason: 'ERROR' });
      }
    });

    /*
     * Watching one SUPPORT thread.
     *
     * The same shape as `track_order` and the same rule: the client names a
     * reference, the server reads the document and decides. A support
     * reference is six characters out of a 32-letter alphabet — short because
     * it gets read down a phone line, which is precisely what makes it
     * unusable as a secret.
     *
     * An administrator is a party to every thread; that is what working the
     * queue means, and they already receive all of them in `support`. Anybody
     * else is a party to exactly the ones they filed, matched on the same two
     * fields the HTTP handlers filter on — including the legacy `customerId`,
     * because a diner's tickets predate the `requester` field and a student
     * whose socket silently refused their own deposit dispute would simply see
     * a thread that never updates.
     */
    socket.on('track_ticket', async (payload, ack) => {
      const reference = String(
        (payload && (payload.reference || payload.ticket)) || payload || '',
      ).trim().toUpperCase();
      if (!reference) return;

      const done = (ok, reason) => {
        if (typeof ack === 'function') ack(reason ? { ok, reason } : { ok });
      };

      if (who.kind === 'admin') {
        socket.join(rooms.ticket(reference));
        done(true);
        return;
      }

      try {
        // eslint-disable-next-line global-require
        const Ticket = require('../../modules/support/ticket.model');
        const ticket = await Ticket.findOne({ reference })
          .select('reference requester.kind requester.id customerId linkedPartnerId')
          .lean();

        const requester = (ticket && ticket.requester) || {};
        const mine = !!ticket && (
          (requester.kind === who.kind && requester.id === who.id)
          /* Legacy diner rows: `customerId` and no `requester`. */
          || (who.kind === 'customer' && ticket.customerId === who.id)
          /*
           * The property's owner, on a ticket a STUDENT filed.
           *
           * `linkedPartnerId` is stamped at creation only when the student
           * said this was about a property whose owner could be resolved —
           * see `createTicket`. A partner is a party to that thread the same
           * way an admin is a party to every thread: not because they wrote
           * it, but because it names them.
           */
          || (who.kind === 'partner' && ticket.linkedPartnerId === who.id)
        );

        if (!mine) {
          done(false, 'NOT_A_PARTY');
          return;
        }
        socket.join(rooms.ticket(reference));
        done(true);
      } catch (error) {
        console.warn(`${BADGE} track_ticket(${reference}) failed: ${error.message}`);
        done(false, 'ERROR');
      }
    });

    socket.on('untrack_ticket', (payload) => {
      const reference = String(
        (payload && (payload.reference || payload.ticket)) || payload || '',
      ).trim().toUpperCase();
      if (reference) socket.leave(rooms.ticket(reference));
    });

    socket.on('untrack_order', (payload) => {
      const orderNumber = String(
        (payload && (payload.orderNumber || payload.orderId)) || payload || '',
      ).trim().toUpperCase();
      if (orderNumber) socket.leave(rooms.order(orderNumber));
    });

    /*
     * A rider's position, relayed to whoever is watching that order.
     *
     * NOT written to `app_drivers` from here. The duty and matching state is
     * owned by `PATCH /me/location`, which is rate-limited and validated; a
     * socket event that could move a driver on the dispatch map would be an
     * unvalidated write on the hot path of matching. This is a relay for the
     * tracking screen and nothing else.
     */
    socket.on('driver_location', (payload) => {
      if (who.kind !== 'driver') return;
      const orderNumber = String((payload && payload.orderNumber) || '').trim().toUpperCase();
      const lat = Number(payload && payload.lat);
      const lng = Number(payload && payload.lng);
      if (!orderNumber || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!socket.rooms.has(rooms.order(orderNumber))) return;

      socket.to(rooms.order(orderNumber)).emit('driver_location', {
        orderNumber, driverId: who.id, lat, lng, at: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`${BADGE} ${who.kind} ${who.id} disconnected (${reason})`);
    });
  });

  console.log(`${BADGE} listening on the same port as the API`);
  return io;
};

/** True when a socket server is actually attached. Printed by the banner. */
const realtimeReady = () => !!io;

/** Which piece is missing, named — or null when nothing is. */
const realtimeProblem = () => {
  if (loadProblem) return loadProblem;
  if (!io) return 'the socket server has not been attached (server.js did not call attachRealtime)';
  return null;
};

/**
 * The one emit.
 *
 * Every named helper below funnels through here so there is a single place
 * that (a) survives `io` being null and (b) never throws into a caller that is
 * midway through a state transition. A push that fails must not roll back a
 * write that succeeded — the same rule as `push.js`.
 */
const emit = (room, event, data) => {
  if (!io) return false;
  try {
    io.to(room).emit(event, data);
    return true;
  } catch (error) {
    console.warn(`${BADGE} emit ${event} → ${room} failed: ${error.message}`);
    return false;
  }
};

/**
 * Emit to a room somebody else named.
 *
 * The escape hatch for callers that compute their own room — `support.
 * notifier.js` picks between the diner's, the rider's and the kitchen's room
 * from a ticket's `requester.kind`, and giving it three near-identical
 * `toX` calls would put that branch in two files. Everything still goes
 * through `emit`, so the null-`io` and never-throw guarantees hold.
 */
const toRoom = (room, event, data) => emit(room, event, data);

/** Every administrator watching the console's support queue. */
const toSupport = (event, data) => emit(SUPPORT_ROOM, event, data);

const toDriver = (driverId, event, data) => emit(rooms.driver(driverId), event, data);
const toCustomer = (customerId, event, data) => emit(rooms.customer(customerId), event, data);
const toRestaurant = (restaurantId, event, data) => emit(rooms.restaurant(restaurantId), event, data);
const toPartner = (partnerId, event, data) => emit(rooms.partner(partnerId), event, data);
const toOrder = (orderNumber, event, data) => emit(rooms.order(orderNumber), event, data);

/**
 * Everyone on one order, addressed by identity rather than by room.
 *
 * The order room only holds sockets that asked to watch it. A diner who has
 * closed the tracking screen is still in `customer:<id>` and still needs to
 * know their rider arrived, so both are sent — socket.io de-duplicates a
 * socket that is in more than one of the rooms, so nobody gets it twice.
 */
const toOrderParties = (order, event, data) => {
  if (!order) return;
  toOrder(order.orderNumber, event, data);
  if (order.customerId) toCustomer(order.customerId, event, data);
  if (order.restaurantId) toRestaurant(order.restaurantId, event, data);
  const driverId = order.delivery && order.delivery.driverId;
  if (driverId) toDriver(driverId, event, data);
};

module.exports = {
  attachRealtime,
  realtimeReady,
  realtimeProblem,
  rooms,
  SUPPORT_ROOM,
  toRoom,
  toSupport,
  toDriver,
  toCustomer,
  toRestaurant,
  toPartner,
  toOrder,
  toOrderParties,
};

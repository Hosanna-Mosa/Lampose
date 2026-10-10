/* ══════════════════════════════════════════════════════════════════════════
   The four kinds of account a person can ask to delete.

   The keys are the SAME words the socket layer and support's `requester.kind`
   use (`customer` | `partner` | `restaurant` | `driver`), so one person's
   deletion, support thread and socket room all spell their app the same way.

   Everything that differs between the four lives here and nowhere else:

     findByPhone   how a number typed into the public page finds the account.
                   Three store E.164; restaurants match on the 10-digit
                   `phoneKey`, because `ownerPhone` came from several spellings.
     activeWork    what is still in this person's hands. REPORTED, never a
                   refusal — somebody may ask to leave mid-shift and is
                   entitled to — but the reply says what still has to finish.

   Models are required lazily so this file can be read by the routes without
   pulling four models into a script that only needs the list of names.
   ══════════════════════════════════════════════════════════════════════════ */

const OPEN_ORDER = { $nin: ['delivered', 'cancelled', 'rejected'] };
const OPEN_BOOKING = { $in: ['in_house', 'arriving', 'departing', 'upcoming'] };

const tenDigits = (e164) => String(e164 || '').replace(/\D/g, '').slice(-10);

const AUDIENCES = {
  customer: {
    key: 'customer',
    appName: 'Lampose',
    who: 'students and diners who book stays and order food',
    model: () => require('../customers/customer.model'),
    findByPhone: (phone) => require('../customers/customer.model').findOne({ phone }),
    idOf: (doc) => doc.customerId,
    phoneOf: (doc) => doc.phone,
    activeWork: async (doc) => {
      const FoodOrder = require('../foodpartners/foodOrder.model');
      const { PartnerBooking } = require('../partners/partnerDomains.model');
      const VisitRequest = require('../visits/visitRequest.model');
      const { HotelRefund } = require('../settlements/hotelRefund.model');
      const [orders, bookings, requests, refunds] = await Promise.all([
        FoodOrder.countDocuments({ customerId: doc.customerId, status: OPEN_ORDER }),
        PartnerBooking.countDocuments({ customerId: doc.customerId, status: OPEN_BOOKING }),
        /* A request still waiting on an owner — the owner is about to answer
           somebody who will no longer be there. */
        VisitRequest.countDocuments({ customerId: doc.customerId, status: { $in: ['otp_pending', 'pending_owner'] } }),
        /* Money owed back with nowhere to send it. Deleting removes the only
           place bank details can be given, so this one is worth saying
           loudest. */
        HotelRefund.countDocuments({ customerId: doc.customerId, status: 'awaiting_details' }),
      ]);
      return {
        activeOrders: orders,
        activeBookings: bookings,
        pendingRequests: requests,
        refundsAwaitingDetails: refunds,
      };
    },
  },

  partner: {
    key: 'partner',
    appName: 'Lampose Stay Partner',
    who: 'property owners who list rooms and PGs',
    model: () => require('../partners/partner.model'),
    findByPhone: (phone) => require('../partners/partner.model').findOne({ phone }),
    idOf: (doc) => doc.partnerId,
    phoneOf: (doc) => doc.phone,
    activeWork: async (doc) => {
      const { PartnerBooking } = require('../partners/partnerDomains.model');
      const bookings = await PartnerBooking.countDocuments({
        partnerPhoneDigits: doc.phoneDigits || tenDigits(doc.phone),
        status: OPEN_BOOKING,
      });
      return { activeBookings: bookings };
    },
  },

  restaurant: {
    key: 'restaurant',
    appName: 'Lampose Partner',
    who: 'restaurants and kitchens that sell food on Lampose',
    model: () => require('../foodpartners/foodRestaurant.model'),
    findByPhone: (phone) => require('../foodpartners/foodRestaurant.model')
      .findOne({ phoneKey: tenDigits(phone) }),
    idOf: (doc) => doc.restaurantId,
    phoneOf: (doc) => doc.ownerPhone,
    activeWork: async (doc) => {
      const FoodOrder = require('../foodpartners/foodOrder.model');
      const orders = await FoodOrder.countDocuments({ restaurantId: doc.restaurantId, status: OPEN_ORDER });
      return { activeOrders: orders };
    },
  },

  driver: {
    key: 'driver',
    appName: 'Lampose Delivery Partner',
    who: 'delivery riders who carry Lampose orders',
    model: () => require('../drivers/driver.model'),
    findByPhone: (phone) => require('../drivers/driver.model').findOne({ phone }),
    idOf: (doc) => doc.driverId,
    phoneOf: (doc) => doc.phone,
    activeWork: async (doc) => {
      const FoodOrder = require('../foodpartners/foodOrder.model');
      /* `delivery.driverId` is the rider carrying it. There is no
         `dispatch.driverId` (offers live in `dispatch.offers[]`), and counting
         on it answered 0 for every rider — so the archive said "no open
         orders" for a rider deleted with the food in hand. */
      const orders = await FoodOrder.countDocuments({ 'delivery.driverId': doc.driverId, status: OPEN_ORDER });
      return { activeOrders: orders };
    },
  },
};

/* The other spellings a store listing or a support email might put in the
   page's `?app=` — accepted so a link written by a person still lands. */
const ALIASES = {
  user: 'customer',
  lampose: 'customer',
  'stay-partner': 'partner',
  owner: 'partner',
  'food-partner': 'restaurant',
  kitchen: 'restaurant',
  rider: 'driver',
  delivery: 'driver',
};

const audienceOf = (value) => {
  const key = String(value || '').trim().toLowerCase();
  return AUDIENCES[key] || AUDIENCES[ALIASES[key]] || null;
};

module.exports = { AUDIENCES, ALIASES, audienceOf };

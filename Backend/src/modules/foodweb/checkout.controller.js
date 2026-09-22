/* ══════════════════════════════════════════════════════════════════════════
   The checkout screen's two lists — where it goes, and how it is paid for.

   Replaces the fixture's `ADDRESSES` and `PAYMENT_METHODS`.

     GET /addresses         the diner's saved addresses, each with a verdict
     GET /payment-methods   what this kitchen actually accepts

   ## The addresses carry a SERVICEABILITY VERDICT, and that is the point

   The fixture has three addresses and deliberately marks one unserviceable,
   with this note against it: "the checkout has to be able to say so in words
   before anybody pays." That is the requirement, and it is the reason this
   endpoint exists rather than the checkout reusing the generic address list
   from `customers/customerAddress.controller.js`.

   That generic list answers "where does this person live". This one answers
   "can this kitchen reach this door right now", which is a different question
   with a different answer per kitchen — and it needs `?kitchenId` to have an
   answer at all.

   Each address therefore comes back with:

     serviceable        can it be delivered to
     unserviceableNote  why not, in a sentence the page can print
     hasPin             does it carry coordinates a rider can navigate to

   ## Why an address with no coordinates is not serviceable

   `location` is optional on the address schema — the app saves one without a
   pin when the device would not give it. The reach rule measures a distance
   and so needs a point, so an address with no pin cannot be checked and is
   reported unserviceable with a note saying exactly that. Reporting it
   serviceable would put the decision on a rider standing in the wrong lane
   at 9pm.

   ## What decides it is the KITCHEN's radius

   The verdict used to come from the `zones` collection, which is gone. It
   now comes from `deliveryRadiusKm` on the kitchen itself, via
   `deliveryReach.util.js` — the one file the feed asks the same question of.
   Read that file before changing what "reaches" means; in particular a
   radius of zero is read as "not declared" and reaches, rather than as a
   kitchen that delivers nowhere.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
const Customer = require('../customers/customer.model');
const { findKitchenForReach, kitchenReaches } = require('./deliveryReach.util');
const { LISTED, firstOf } = require('./foodWeb.shape');

/**
 * One saved address, shaped the way the fixture's `ADDRESSES` rows are.
 *
 * `title` and `detail` are the two lines the checkout prints. They are built
 * here rather than on the client so that the card, the order summary and the
 * message sent to the rider all read identically.
 */
const addressRow = (address, verdict) => {
  const pin = address.location && Array.isArray(address.location.coordinates)
    && address.location.coordinates.length === 2 ? address.location.coordinates : null;

  return {
    id: address.addressId,
    title: firstOf(address.label, address.line1),
    detail: [address.line1, address.line2, address.landmark, address.city, address.pincode]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(', '),
    instructions: address.instructions || '',
    isDefault: Boolean(address.isDefault),
    kind: address.kind || 'home',
    hasPin: Boolean(pin),
    /*
     * The point a rider is sent to, as NAMED numbers rather than the stored
     * pair. MongoDB keeps a point as [LONGITUDE, LATITUDE], and the order
     * endpoint reads `dropLat` and `dropLng` by name precisely because the
     * swap is the classic mistake - a delivery to a place on the wrong side of
     * the planet. Naming them here means the website never handles the pair and
     * cannot reverse it. Null when the address has no pin, and the order is
     * then placed without one, exactly as the app does when the phone would not
     * give a location.
     *
     * This is the diner's OWN address, sent only to them (the route is behind
     * the customer guard and reads only their document).
     */
    lat: pin ? pin[1] : null,
    lng: pin ? pin[0] : null,
    serviceable: verdict.serviceable,
    unserviceableNote: verdict.note,
  };
};

/**
 * The diner's addresses, each judged against one kitchen.
 *
 * @route   GET /api/v2/food-web/addresses
 * @access  customer session required
 *
 * Query:
 *   kitchenId  optional. Without it every address comes back with
 *              `serviceable: true` and no note — the list is then just a
 *              list, which is what the account screen wants. The CHECKOUT
 *              always sends it.
 */
const listAddresses = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ customerId: req.customer.customerId })
      .select('addresses')
      .lean();

    const saved = (customer && customer.addresses) || [];
    const kitchenId = String(req.query.kitchenId || '').trim();

    /* No kitchen named: nothing to judge against, so nothing is judged. */
    if (!kitchenId) {
      const addresses = saved.map((address) => addressRow(address, { serviceable: true, note: '' }));
      return res.json({ success: true, data: { addresses, count: addresses.length, judged: false } });
    }

    const kitchen = await findKitchenForReach(kitchenId);

    if (!kitchen) {
      const message = 'That kitchen is not available.';
      return res.status(404).json({
        success: false, code: 'KITCHEN_NOT_FOUND', message, error: message,
      });
    }

    /*
     * One kitchen read, then every address judged against it in memory. The
     * rule is arithmetic on two pins, so there is nothing per-address to
     * await — which is also why a diner with three addresses costs one query
     * rather than four.
     */
    const addresses = saved.map((address) => {
      const pin = address.location && address.location.coordinates;

      if (!Array.isArray(pin) || pin.length !== 2) {
        return addressRow(address, {
          serviceable: false,
          note: 'This address has no map pin yet, so a rider cannot be sent to it. '
            + 'Open it and drop a pin, or choose another address.',
        });
      }

      /* Stored [LONGITUDE, LATITUDE]; handed over as named latitude, longitude. */
      const reaches = kitchenReaches(kitchen, pin[1], pin[0]);
      return addressRow(address, {
        serviceable: reaches,
        note: reaches ? '' : `Outside ${kitchen.restaurantName}'s delivery area. `
          + 'Choose another address, or order from a kitchen closer to you.',
      });
    });

    return res.json({
      success: true,
      data: { addresses, count: addresses.length, judged: true, kitchenId },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * How this order may be paid for.
 *
 * Built from the KITCHEN's own two switches rather than from a constant,
 * because `acceptsOnlinePayment` and `acceptsCod` are real fields an owner
 * sets — a kitchen that has turned cash off must not be offered cash, and the
 * fixture's flat list of methods cannot express that.
 *
 * The copy on each row is this file's, not the kitchen's. It explains what
 * actually happens next, which is the thing a diner is deciding between:
 * whether they are about to be handed to Razorpay, or to owe a rider money at
 * the door.
 *
 * @route   GET /api/v2/food-web/payment-methods
 * @access  public
 *
 * Query:
 *   kitchenId  required — there is no kitchen-independent answer
 */
const listPaymentMethods = async (req, res, next) => {
  try {
    const kitchenId = String(req.query.kitchenId || '').trim();
    if (!kitchenId) {
      const message = 'Name the kitchen this order is for.';
      return res.status(400).json({
        success: false, code: 'KITCHEN_REQUIRED', message, error: message,
      });
    }

    const kitchen = await FoodRestaurant.findOne({ restaurantId: kitchenId, ...LISTED })
      .select('acceptsOnlinePayment acceptsCod')
      .lean();

    if (!kitchen) {
      const message = 'That kitchen is not available.';
      return res.status(404).json({
        success: false, code: 'KITCHEN_NOT_FOUND', message, error: message,
      });
    }

    const methods = [];

    if (kitchen.acceptsOnlinePayment !== false) {
      methods.push({
        id: 'upi',
        label: 'UPI · GPay, PhonePe, Paytm',
        icon: 'verified',
        tag: 'Fastest',
        note: 'Opens Razorpay. The kitchen is told once the payment is signed and verified.',
        online: true,
      });
      methods.push({
        id: 'card',
        label: 'Card',
        icon: 'card',
        tag: '',
        note: 'Opens Razorpay. Credit, debit and netbanking.',
        online: true,
      });
    }

    if (kitchen.acceptsCod !== false) {
      methods.push({
        id: 'cod',
        label: 'Cash on delivery',
        icon: 'cash',
        tag: '',
        note: 'Pay the rider at the door. Please keep change ready.',
        online: false,
      });
    }

    return res.json({
      success: true,
      data: {
        methods,
        count: methods.length,
        /* A kitchen with BOTH switches off can take no orders at all. Said
           plainly so the checkout refuses before the diner builds a cart,
           rather than showing an empty method list that reads as a bug. */
        payable: methods.length > 0,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listAddresses, listPaymentMethods, addressRow };

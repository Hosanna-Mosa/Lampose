/* ══════════════════════════════════════════════════════════════════════════
   The coupons offered at checkout.

   Replaces the fixture's `COUPONS`.

     GET /coupons

   ## Read this before wiring the checkout to it

   NO COUPON IN THIS SYSTEM IS CURRENTLY REDEEMABLE ON A FOOD ORDER, and every
   row this route returns says so with `enforced: false`.

   The reason is one line: `foodpartners/foodCustomerOrder.controller.js`
   builds the bill with `discount: 0`. There is no code path in the process
   that subtracts a coupon from a food order, and none that marks one spent.
   So a checkout that subtracted ₹20 on the strength of this reply would show
   a total the server will not charge — and the diner would find out at the
   payment screen.

   There are TWO different things called a coupon here, and they are described
   separately because they will become redeemable separately:

     kind 'referral'   A REAL ROW. `food_coupons` holds one per customer,
                       worth `amountRupees`, written by the referral flow in
                       `partners/customerReferral.controller.js` when somebody
                       they referred books a stay. The data is genuine and
                       belongs to that person. But nothing READS it at order
                       time and nothing flips `status` to 'used', so today it
                       is a balance that can be displayed and not spent.

                       (An earlier version of this file marked it
                       `enforced: true`. That was wrong: a row existing is not
                       the same as an order honouring it.)

     kind 'promo'      FIRST50, PICKUP10 — codes carried over from the
                       website's fixture. THERE IS NO MODEL BEHIND THESE. No
                       collection stores them, nothing marks one as spent, and
                       no administrator can create or retire one without a
                       deploy.

   ## Why the promos are a constant here rather than a new collection

   Writing a `food_promotions` model was not asked for, and inventing a schema
   is the kind of decision that should be made deliberately rather than as a
   side effect of replacing a fixture. A constant is honest about what it is:
   the codes are visible, versioned in git, and changing one is a code review.

   ## What the website does with this

   It applies only rows where `enforced` is true, so today it applies none —
   the bill it shows is the bill the server will charge.

   When redemption is real, this file is the seam: the order controller
   subtracts and consumes a coupon, the matching row here flips to
   `enforced: true`, and the checkout does not change.
   ══════════════════════════════════════════════════════════════════════════ */
const FoodCoupon = require('../customers/foodCoupon.model');

/*
 * The promotional codes, as data.
 *
 * Shaped exactly like the fixture's `COUPONS` so the checkout's chip list
 * renders unchanged:
 *
 *   code       what the diner types
 *   headline   the big text on the chip — "₹20 off"
 *   body       the condition, in words
 *   discount   whole rupees off
 *   minimum    the item total this needs, 0 for none
 *   kitchenId  present when the offer belongs to ONE kitchen
 *   pickupOnly present when it needs collection rather than delivery
 */
const PROMOS = Object.freeze([
  {
    code: 'FIRST50',
    headline: '₹50 off',
    body: 'Your first order over ₹299',
    discount: 50,
    minimum: 299,
  },
  {
    code: 'PICKUP10',
    headline: '₹10 off',
    body: '₹10 off when you collect it yourself',
    discount: 10,
    minimum: 0,
    pickupOnly: true,
  },
]);

/**
 * The coupons this diner can see.
 *
 * Anonymous callers get the promos alone — there is nobody to look a referral
 * credit up for, and refusing the whole route would leave a signed-out diner
 * staring at a checkout with no offers rather than the two that apply to
 * everybody.
 *
 * `attachCustomerIfPresent` on the route is what makes that work: it sets
 * `req.customer` when a valid token is sent and does nothing when one is not,
 * so this handler has one shape for both cases.
 *
 * @route   GET /api/v2/food-web/coupons
 * @access  public; richer when a customer token is sent
 *
 * Query:
 *   kitchenId  drop kitchen-specific offers that belong to a different
 *              kitchen. The checkout always knows which kitchen it is
 *              ordering from, so it always sends this.
 */
const listCoupons = async (req, res, next) => {
  try {
    const kitchenId = String(req.query.kitchenId || '').trim();

    const promos = PROMOS
      .filter((promo) => !promo.kitchenId || !kitchenId || promo.kitchenId === kitchenId)
      .map((promo) => ({
        ...promo,
        kind: 'promo',
        /* Said on every row rather than inferred from `kind`, because the
           checkout's job is to decide whether it may subtract this, and a
           boolean it can read is harder to get wrong than a rule it has to
           remember. See the file header. */
        enforced: false,
      }));

    const coupons = [...promos];

    /* The real one, when somebody is signed in and has an unspent credit. */
    if (req.customer && req.customer.customerId) {
      const credit = await FoodCoupon.findOne({
        customerId: req.customer.customerId,
        status: 'active',
      }).lean();

      if (credit) {
        coupons.unshift({
          /* No typed code: this is not something a diner enters, it is
             something they own. The checkout shows it as a switch. */
          code: '',
          kind: 'referral',
          headline: `₹${credit.amountRupees} off`,
          body: credit.propertyName
            ? `Your referral credit from ${credit.propertyName}`
            : 'Your referral credit',
          discount: Number(credit.amountRupees) || 0,
          minimum: 0,
          /* A real row, but NOT redeemable: `POST /orders` bills with
             `discount: 0` and nothing consumes `food_coupons`. Reporting it
             enforced would have the checkout subtract money the server then
             charges anyway. See the file header. */
          enforced: false,
        });
      }
    }

    return res.json({ success: true, data: { coupons, count: coupons.length } });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listCoupons, PROMOS };

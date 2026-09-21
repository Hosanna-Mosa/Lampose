/* ══════════════════════════════════════════════════════════════════════════
   Every route group, and the version it belongs to.

   Two API surfaces live in this process, because the two backends that were
   merged disagreed about what some of the same paths mean. Versioning them is
   what makes the disagreement harmless instead of a silent bug:

     v1   what the onboarding backend always served.
          onboard.lampose.com and the admin console.
          POST /properties starts a Twilio WhatsApp verification; the listing
          only becomes real once the owner and a verifier both reply YES.
          PUT/DELETE need an administrator's grant.

     v2   what the leads backend served.
          lampose.com (read-only listings) and leads.lampose.com.
          POST /properties writes immediately behind a bearer token.

   ── Unversioned paths ───────────────────────────────────────────────────
   Every frontend in the repo was written against unversioned paths, so those
   keep working, each resolving to the version that already answered it:

     /api/properties     → v1   (onboards-frontend calls this today)
     /api/permissions    → v1
     /api/verifications  → v1
     /api/whatsapp       → v1   (the Twilio webhook URL — do not move it)
     /api/admin          → v1
     /api/listings       → v2   (lampose-frontend)
     /api/visit-requests → v2   (lampose-frontend "Request a visit")
     /api/auth           → v2
     /api/users          → v2
     /api/scraper        → v2
     /api/health         → shared

   /customers, /support and /partners are deliberately NOT in that list, bare
   or /api-prefixed. All three are new — no frontend was ever written against
   an unversioned form of any of them — and an alias exists to keep old callers
   working, not to give new ones a second spelling to drift onto.

   ── One webhook, two workflows ──────────────────────────────────────────
   /api/whatsapp/webhook is the only Twilio inbound URL and stays where it
   is. Two unrelated business flows arrive through it and are told apart by
   the word the owner sends, never by the route:

     YES / NO    property verification  (v1, VerificationRequest)
     AVAILABLE   visit availability     (v2, VisitRequest)

   `/properties` with no /api prefix is deliberately NOT mounted. It is the
   one path where the two versions mean different things, and a deployment
   whose base URL lost its /api would otherwise get the wrong semantics
   silently rather than a 404 that says so. The unambiguous groups keep their
   bare aliases, which is what the leads backend did and what stops a
   copy-pasted env var from becoming an outage.
   ══════════════════════════════════════════════════════════════════════════ */
const healthRoutes = require('./health.routes');

const v1PropertyRoutes = require('../src/modules/properties/property.routes.v1');
const v1AdminRoutes = require('../src/modules/admins/admin.routes');
const v1StatsRoutes = require('../src/modules/admins/stats.routes');
const v1VerificationRoutes = require('../src/modules/verification/verification.routes');
const v1PermissionRoutes = require('../src/modules/permissions/permission.routes');
const v1AnalyticsRoutes = require('../src/modules/analytics/analytics.routes');
const v1VisitRequestAdminRoutes = require('../src/modules/visits/visitRequest.admin.routes');
const v1PartnerPayoutAdminRoutes = require('../src/modules/partners/partnerPayout.admin.routes');
const v1RefundAdminRoutes = require('../src/modules/settlements/refund.admin.routes');
const v1MonitorAdminRoutes = require('../src/modules/settlements/monitor.admin.routes');
const v1ScriperUserAdminRoutes = require('../src/modules/scraper/scriperUser.admin.routes');
const v1ScraperJobAdminRoutes = require('../src/modules/scraper/scraperJob.admin.routes');
const v1ScraperLeadAdminRoutes = require('../src/modules/scraper/scraperLead.admin.routes');
const v1ProductAdminRoutes = require('../src/modules/properties/product.routes');
const v1MessagingRoutes = require('../src/modules/messaging/messaging.routes');
const v1FoodAdminRoutes = require('../src/modules/foodpartners/foodAdmin.routes');
const v1FoodOrderAdminRoutes = require('../src/modules/foodpartners/foodOrderAdmin.routes');
const v1DriverAdminRoutes = require('../src/modules/drivers/driverAdmin.routes');
const v1SupportAdminRoutes = require('../src/modules/support/supportAdmin.routes');

const v2ListingRoutes = require('../src/modules/listings/listing.routes');
const v2VisitRequestRoutes = require('../src/modules/visits/visitRequest.routes');
const v2PaymentWebhookRoutes = require('../src/modules/visits/paymentWebhook.routes');
const v2PropertyRoutes = require('../src/modules/properties/property.routes.v2');
const v2AuthRoutes = require('../src/modules/auth/auth.routes');
const v2UserRoutes = require('../src/modules/users/user.routes');
const v2ScraperRoutes = require('../src/modules/scraper/scraper.routes');
const v2CustomerRoutes = require('../src/modules/customers/customer.routes');
const v2SupportRoutes = require('../src/modules/support/ticket.routes');
/* The SAME module, built four times — one router per audience, each behind
   its own guard. See the header of ticket.routes.js for why this is four
   routers rather than one guard that understands four token types. */
const {
  driverSupportRouter: v2DriverSupportRoutes,
  restaurantSupportRouter: v2RestaurantSupportRoutes,
  partnerSupportRouter: v2PartnerSupportRoutes,
} = v2SupportRoutes;
const v2PartnerRoutes = require('../src/modules/partners/partner.routes');
const v2FoodPartnerRoutes = require('../src/modules/foodpartners/foodPartner.routes');
const v2DriverRoutes = require('../src/modules/drivers/driver.routes');

/* [mount path, router, one-line description]. The description is what the
   banner and GET /api print, so it is worth keeping accurate. */
const V1_GROUPS = [
  ['/health', healthRoutes, 'process + database status'],
  ['/properties', v1PropertyRoutes, 'onboarding CRUD, Cloudinary upload, WhatsApp verification'],
  ['/admin', v1AdminRoutes, 'admin console accounts (admins collection)'],
  ['/admin', v1StatsRoutes, 'dashboard stats, activity feed, system telemetry'],
  ['/admin/analytics', v1AnalyticsRoutes, 'GA4 website analytics (Google Analytics Data API)'],
  ['/verifications', v1VerificationRoutes, 'owner/verifier verification requests'],
  ['/whatsapp', v1VerificationRoutes, 'Twilio inbound webhook'],
  ['/permissions', v1PermissionRoutes, 'employee edit/delete permission requests'],
  ['/admin/visit-requests', v1VisitRequestAdminRoutes, 'Super Admin CRUD — visitrequests collection'],
  ['/admin/partner-payouts', v1PartnerPayoutAdminRoutes, 'Super Admin — Stay Partner payout queue, RazorpayX dispatch'],
  ['/admin/refunds', v1RefundAdminRoutes, 'guest refunds for cancelled hotel stays; Super Admin marks them paid'],
  /* Monitor: bookings and money across all four categories. Reading is open to
     any active administrator; changing a commission needs Admin, and releasing
     a hotel's share needs Super Admin. See the router. */
  ['/admin/monitor', v1MonitorAdminRoutes, 'booking + payment monitor, per category; hotel commission and payout release'],
  ['/admin/scriper-users', v1ScriperUserAdminRoutes, 'Super Admin CRUD — leads panel accounts (scriper_users)'],
  ['/admin/scriper-jobs', v1ScraperJobAdminRoutes, 'Super Admin CRUD — scrape job history (scriper_jobs)'],
  ['/admin/scriper-leads', v1ScraperLeadAdminRoutes, 'Super Admin CRUD — scraped leads (scriper_leads)'],
  ['/admin/products', v1ProductAdminRoutes, 'Super Admin CRUD — products collection'],
  ['/admin/whatsapp', v1MessagingRoutes, 'admin-console ad-hoc WhatsApp sends (free text or configured Content Templates)'],
  /* The food-partner approval queue. v1 because its reader is an administrator
     in `admins` — the v1 identity system — not the restaurant's own session.
     Role-gated to Admin / Food Admin inside the router rather than locked to
     Super Admin: it is daily operational work with a screen of its own. */
  ['/admin/food-restaurants', v1FoodAdminRoutes, 'food partner applications: the approval queue and its decisions'],
  /* The orders those restaurants cook, and the refund button. A SECOND admin
     router in the same module rather than more routes on the one above,
     because the two answer different questions and the role gates differ:
     anybody signed in may read the queue, and only Super Admin / Admin may
     send a diner their money back. Until this existed, `markForRefund` marked
     an order `refunded`, warned "refund this in the dashboard" and there was
     no dashboard — the money stopped at a status word. */
  ['/admin/food-orders', v1FoodOrderAdminRoutes, 'food orders: the queue that needs a human, one order reconciled, and the refund'],
  /* The rider queue, and the other half of the rule that makes "approved" mean
     something: NO route on /api/v2/drivers can set a rider's status, so this is
     the only way one ever gets on the road. Same identity, same roles and the
     same reasoning as the restaurant queue above. */
  ['/admin/drivers', v1DriverAdminRoutes, 'rider applications: the approval queue, suspensions, and the roster'],
  /* The support queue, spanning all three apps. Every ticket a diner, rider
     or restaurant files arrives here; the three app-facing routers under v2
     can only ever read their own author's threads. */
  ['/admin/support', v1SupportAdminRoutes, 'support queue: threads from all three apps, replies, status and assignment'],
];

const V2_GROUPS = [
  ['/health', healthRoutes, 'process + database status'],
  ['/listings', v2ListingRoutes, 'public Explore feed for lampose.com'],
  ['/visit-requests', v2VisitRequestRoutes, 'availability requests: OTP, then the owner is asked on WhatsApp'],
  /* Razorpay reporting a paid ₹199 assisted visit. Its own mount because it
     is called by a payment gateway rather than by any of our clients, and it
     verifies a signature over the raw body rather than trusting a session. */
  ['/payments', v2PaymentWebhookRoutes, 'razorpay webhook: a paid ₹199 visit starts the slot step'],
  ['/properties', v2PropertyRoutes, 'direct property CRUD for the leads panel'],
  ['/auth', v2AuthRoutes, 'leads panel + onboarding employee login'],
  ['/users', v2UserRoutes, 'leads panel team management'],
  ['/scraper', v2ScraperRoutes, 'Google Maps lead scraping, leads, exports'],
  /* The mobile app's own accounts — students, in `app_customers`. A THIRD
     identity system, and separate from /auth above on purpose: that one is
     staff, with an email, a password and a role. See customer.model.js. */
  ['/customers', v2CustomerRoutes, 'mobile app accounts: phone + one-time code, profile'],
  /* Support tickets and safety reports from the app. Its own group rather
     than a branch of /customers because a ticket has its own collection, its
     own lifecycle and a reader who is not the customer — the same reason
     /visit-requests is not under /customers either. */
  ['/support', v2SupportRoutes, 'mobile app support tickets and safety reports'],
  /* Property owners, in `app_partners`. A FOURTH identity system — see
     partnerAuth.middleware.js. Their properties and their customers' visit
     requests are scoped by the phone number they proved, which is the same
     number the onboarding flow already recorded on the property. */
  /* The owner's support threads — same module as the diner's, driver's and
     kitchen's, different guard, and the one audience that ALSO reads tickets
     it did not file: a student's ticket about one of this owner's properties
     shows up here too — see `ticket.controller.js`'s `ownedBy` and
     `resolveLinkedPartner`. Before the general /partners mount, for the same
     ordering reason /food-partners/support and /drivers/support are. */
  ['/partners/support', v2PartnerSupportRoutes, 'Stay Partner app: support tickets, including guest tickets about their properties'],
  ['/partners', v2PartnerRoutes, 'Stay Partner app: owner accounts, their properties and visit requests'],
  /* Restaurants, in `food_restaurants` + `food_products` + `food_orders`. A
     FIFTH identity system — see foodPartnerAuth.middleware.js, which refuses
     any token not carrying `typ: 'foodpartner'`. Deliberately given NO
     unversioned alias: nothing was ever written against one, and the aliases
     below exist to keep old callers working, not to hand new ones a second
     spelling to drift onto. */
  /* The kitchen's support threads. Mounted UNDER its own app's path rather
     than beside /support, because the guard is what makes them different
     routers and the path should say whose guard it is.

     BEFORE the general /food-partners mount, and that ordering is load
     bearing: Express tries mounts in order, and a router whose own middleware
     answers 401 on an unmatched path never calls next(). Registering the
     broad prefix first would let it refuse a support request that was never
     its to handle. */
  ['/food-partners/support', v2RestaurantSupportRoutes, 'Food-Partner app: support tickets'],
  ['/food-partners', v2FoodPartnerRoutes, 'Food-Partner app: restaurant onboarding, menu, orders, public discovery'],
  /* Riders, in `app_drivers`. A SIXTH identity system — see
     driverAuth.middleware.js, which refuses any token not carrying
     `typ: 'driver'`. This is the other half of the food-delivery loop: the
     order is written under /food-partners and carried under /drivers, and the
     two meet at `food_orders`. Deliberately given NO unversioned alias, for
     the same reason /food-partners has none — the aliases exist to keep old
     callers working, not to hand new ones a second spelling to drift onto. */
  /* The rider's support threads — same module as the diner's, different
     guard. Behind `requireDriver` and NOT `requireApprovedDriver`: a rider
     whose documents were just rejected is the one most likely to need help.

     Before the general /drivers mount, for the ordering reason given above. */
  ['/drivers/support', v2DriverSupportRoutes, 'Driver app: support tickets'],
  ['/drivers', v2DriverRoutes, 'Driver app: rider accounts, duty, live position, delivery offers'],
];

/* Which version answers each unversioned path, and whether it also answers
   without the /api prefix. */
const LEGACY_ALIASES = [
  // path, router, bare (no /api) alias too?
  ['/health', healthRoutes, true],
  ['/properties', v1PropertyRoutes, false],
  ['/admin', v1AdminRoutes, false],
  ['/admin', v1StatsRoutes, false],
  ['/admin/analytics', v1AnalyticsRoutes, false],
  ['/verifications', v1VerificationRoutes, false],
  ['/whatsapp', v1VerificationRoutes, false],
  ['/permissions', v1PermissionRoutes, false],
  ['/admin/visit-requests', v1VisitRequestAdminRoutes, false],
  ['/admin/partner-payouts', v1PartnerPayoutAdminRoutes, false],
  ['/admin/refunds', v1RefundAdminRoutes, false],
  ['/admin/monitor', v1MonitorAdminRoutes, false],
  ['/admin/scriper-users', v1ScriperUserAdminRoutes, false],
  ['/admin/scriper-jobs', v1ScraperJobAdminRoutes, false],
  ['/admin/scriper-leads', v1ScraperLeadAdminRoutes, false],
  ['/admin/products', v1ProductAdminRoutes, false],
  ['/admin/whatsapp', v1MessagingRoutes, false],
  ['/listings', v2ListingRoutes, true],
  ['/visit-requests', v2VisitRequestRoutes, true],
  ['/auth', v2AuthRoutes, true],
  ['/users', v2UserRoutes, true],
  ['/scraper', v2ScraperRoutes, true],
];

const registerRoutes = (app) => {
  for (const [path, router] of V1_GROUPS) app.use(`/api/v1${path}`, router);
  for (const [path, router] of V2_GROUPS) app.use(`/api/v2${path}`, router);

  for (const [path, router, bare] of LEGACY_ALIASES) {
    app.use(`/api${path}`, router);
    if (bare) app.use(path, router);
  }
};

/** Human-readable route map, used by the boot banner and GET /api. */
const routeMap = () => ({
  v1: V1_GROUPS.map(([path, , description]) => ({ path: `/api/v1${path}`, description })),
  v2: V2_GROUPS.map(([path, , description]) => ({ path: `/api/v2${path}`, description })),
  legacy: LEGACY_ALIASES.map(([path, router]) => {
    const inV1 = V1_GROUPS.some(([, r]) => r === router);
    const inV2 = V2_GROUPS.some(([, r]) => r === router);
    return {
      path: `/api${path}`,
      servedBy: inV1 && inV2 ? 'shared' : (inV1 ? 'v1' : 'v2'),
    };
  }),
});

module.exports = { registerRoutes, routeMap, V1_GROUPS, V2_GROUPS, LEGACY_ALIASES };

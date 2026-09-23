/* ══════════════════════════════════════════════════════════════════════════
   Carrying out a deletion request once its grace period has passed.

   ## Erased, not removed

   The account ROW stays, emptied. Everything that identifies the person — name,
   number, email, addresses, documents, bank details, devices, location — is
   cleared, and the row is left holding its id and `deletion.status:
   'completed'`. Two reasons it is not a `deleteOne`:

     · Orders, bookings, payouts and support threads point at the account by
       id, and they are the records the deletion page promises to KEEP (books
       of account, tax, disputes). A dangling id is fine; a missing row that a
       controller `populate`s or `findOne`s is a 500 in somebody's order history.
     · The row is the proof the request was honoured, and when.

   The phone number is replaced with `deleted:<id>` rather than cleared: it is
   required and unique, and a placeholder frees the real number to register a
   NEW account while keeping the index valid.

   ## Work in hand postpones, it never loses

   An order still cooking or on a bike, or a guest still checked in, and the
   account is left for the next run — the request stands, it is simply not
   carried out underneath somebody's dinner.

   ## Targeted writes only

   Every write is an `updateOne`/`updateMany` naming its fields. `save()` would
   re-run validators across a document that may predate half of them, and
   pre-save hooks (the partner's `phoneDigits` derivation) would put back what
   was just cleared.

   Not done here, and said so on purpose: images already uploaded to
   Cloudinary (documents, dish photos) are unlinked from the account but not
   deleted from the media account.
   ══════════════════════════════════════════════════════════════════════════ */

const { AUDIENCES } = require('./accountDeletion.audiences');
const { isReviewAccount } = require('../reviewAccounts/reviewAccounts.service');

const placeholder = (id) => `deleted:${id}`;

const hasWork = (work) => Object.values(work || {}).some((n) => Number(n) > 0);

/** Name and number off every support thread this person opened. The thread
    itself is kept — see `support/supportAdmin.controller.js`. */
const scrubSupport = async (kind, id, extra = {}) => {
  const Ticket = require('../support/ticket.model');
  const blank = {
    'requester.name': '', 'requester.phone': '', customerName: '', customerPhone: '',
  };
  const or = [{ 'requester.kind': kind, 'requester.id': id }];
  if (extra.customerId) or.push({ customerId: extra.customerId });
  const res = await Ticket.updateMany({ $or: or }, { $set: blank });
  return res.modifiedCount || 0;
};

const completedDeletion = (doc, now) => ({
  status: 'completed',
  requestedAt: doc.deletion && doc.deletion.requestedAt,
  scheduledFor: doc.deletion && doc.deletion.scheduledFor,
  cancelledAt: null,
  processedAt: now,
  /* Free text and a contact address are personal data too. */
  reason: '',
  contactEmail: '',
  source: (doc.deletion && doc.deletion.source) || '',
});

/* One per audience: the fields that identify the person, and the side
   collections that exist only for them. */
const ERASERS = {
  customer: async (doc, now) => {
    const Customer = require('../customers/customer.model');
    await Customer.updateOne({ _id: doc._id }, {
      $set: {
        phone: placeholder(doc.customerId),
        name: '',
        email: '',
        devices: [],
        addresses: [],
        status: 'blocked',
        phoneVerifiedAt: null,
        lastLoginAt: null,
        deletion: completedDeletion(doc, now),
      },
      $unset: { saved: '', foodFavourites: '', otp: '' },
      /* Every token issued to this account stops working at once. */
      $inc: { sessionVersion: 1 },
    });
    return { supportThreads: await scrubSupport('customer', doc.customerId, { customerId: doc.customerId }) };
  },

  partner: async (doc, now) => {
    const Partner = require('../partners/partner.model');
    const { PartnerPaymentMethod, PartnerStaff, PartnerNotification } = require('../partners/partnerDomains.model');
    const digits = doc.phoneDigits;

    await Partner.updateOne({ _id: doc._id }, {
      $set: {
        phone: placeholder(doc.partnerId),
        /* Unlinks the properties and bookings that carry the old number —
           ownership is derived from it (see partner.model.js). */
        phoneDigits: placeholder(doc.partnerId),
        name: '',
        email: '',
        businessName: '',
        devices: [],
        acceptingBookings: false,
        status: 'blocked',
        phoneVerifiedAt: null,
        lastLoginAt: null,
        deletion: completedDeletion(doc, now),
      },
      $unset: { passwordHash: '', address: '', payoutOnboarding: '', otp: '' },
      $inc: { sessionVersion: 1 },
    });

    const [methods, staff, notices] = digits
      ? await Promise.all([
        PartnerPaymentMethod.deleteMany({ partnerPhoneDigits: digits }),
        PartnerStaff.deleteMany({ partnerPhoneDigits: digits }),
        PartnerNotification.deleteMany({ partnerPhoneDigits: digits }),
      ])
      : [{}, {}, {}];

    return {
      paymentMethods: methods.deletedCount || 0,
      staff: staff.deletedCount || 0,
      notifications: notices.deletedCount || 0,
      supportThreads: await scrubSupport('partner', doc.partnerId),
    };
  },

  restaurant: async (doc, now) => {
    const FoodRestaurant = require('../foodpartners/foodRestaurant.model');
    const FoodProduct = require('../foodpartners/foodProduct.model');

    await FoodRestaurant.updateOne({ _id: doc._id }, {
      $set: {
        ownerPhone: placeholder(doc.restaurantId),
        phoneKey: placeholder(doc.restaurantId),
        /* Required by the schema, so a word rather than an empty string. The
           restaurant NAME is kept: it is the business, it is already printed
           on every past order, and it is not a person. */
        ownerName: 'Deleted account',
        fssaiLicenseNumber: 'DELETED',
        contactNumber: '',
        description: '',
        gstNumber: '',
        panNumber: '',
        payoutAccounts: [],
        verificationDocuments: [],
        devices: [],
        /* Off the app and the website. */
        isActive: false,
        openState: 'closed',
        deletion: completedDeletion(doc, now),
      },
      $unset: {
        ownerEmail: '', passwordHash: '', passwordSetup: '', aadhaar: '', payout: '',
        address: '', location: '', logoImage: '', coverBannerImage: '',
      },
    });

    /* Past orders carry their own copy of every line (`foodOrder.model.js`),
       and favourites already skip a dish that no longer exists. */
    const menu = await FoodProduct.deleteMany({ restaurantId: doc.restaurantId });
    return {
      dishes: menu.deletedCount || 0,
      supportThreads: await scrubSupport('restaurant', doc.restaurantId),
    };
  },

  driver: async (doc, now) => {
    const Driver = require('../drivers/driver.model');
    await Driver.updateOne({ _id: doc._id }, {
      $set: {
        phone: placeholder(doc.driverId),
        name: '',
        email: '',
        dateOfBirth: null,
        city: '',
        profilePhotoUrl: '',
        documents: [],
        devices: [],
        isOnline: false,
        isAvailable: false,
        onlineSince: null,
        currentOrderNumber: null,
        locationUpdatedAt: null,
        heading: null,
        phoneVerifiedAt: null,
        lastLoginAt: null,
        deletion: completedDeletion(doc, now),
      },
      $unset: { address: '', vehicle: '', payout: '', currentLocation: '', otp: '' },
    });
    return { supportThreads: await scrubSupport('driver', doc.driverId) };
  },
};

/**
 * Carry out one account's request, if it is due and nothing is in hand.
 *
 * Returns `{ outcome: 'erased' | 'postponed' | 'skipped', … }` and never
 * throws for an ordinary reason — a worker sweeping many accounts must not
 * stop at the first odd one.
 */
const eraseAccount = async (audienceKey, doc, { now = new Date() } = {}) => {
  const audience = AUDIENCES[audienceKey];
  const d = doc.deletion || {};
  if (!audience) return { outcome: 'skipped', reason: 'unknown audience' };
  if (d.status !== 'requested') return { outcome: 'skipped', reason: `status is ${d.status || 'none'}` };
  if (!d.scheduledFor || new Date(d.scheduledFor) > now) return { outcome: 'skipped', reason: 'not due yet' };
  /* A store reviewer trying the delete button must not take the review
     account away from the next reviewer. The request stays; it is never run. */
  if (isReviewAccount(audienceKey, doc)) return { outcome: 'skipped', reason: 'review account' };

  const work = await audience.activeWork(doc);
  if (hasWork(work)) return { outcome: 'postponed', work };

  const removed = await ERASERS[audienceKey](doc, now);
  return { outcome: 'erased', removed };
};

/** Every request whose date has passed, per audience, oldest first. */
const findDue = (audienceKey, { now = new Date(), limit = 50 } = {}) => AUDIENCES[audienceKey].model()
  .find({ 'deletion.status': 'requested', 'deletion.scheduledFor': { $lte: now } })
  .sort({ 'deletion.scheduledFor': 1 })
  .limit(limit);

/**
 * One sweep across all four audiences. Used by the worker and by
 * `scripts/process-account-deletions.js`; `dryRun` reports what WOULD happen.
 */
const processDueDeletions = async ({ now = new Date(), dryRun = false, log = () => {} } = {}) => {
  const summary = { erased: 0, postponed: 0, failed: 0, items: [] };

  for (const key of Object.keys(AUDIENCES)) {
    const due = await findDue(key, { now });
    for (const doc of due) {
      const id = AUDIENCES[key].idOf(doc);
      try {
        if (dryRun) {
          if (isReviewAccount(key, doc)) {
            summary.items.push({ app: key, id, outcome: 'skipped', reason: 'review account' });
            log(`${key} ${id}: skipped (review account)`);
            continue;
          }
          const work = await AUDIENCES[key].activeWork(doc);
          const outcome = hasWork(work) ? 'postponed' : 'would erase';
          summary.items.push({ app: key, id, outcome, work });
          log(`${key} ${id}: ${outcome}`);
          continue;
        }
        const result = await eraseAccount(key, doc, { now });
        if (result.outcome === 'erased') summary.erased += 1;
        if (result.outcome === 'postponed') summary.postponed += 1;
        summary.items.push({ app: key, id, ...result });
        log(`${key} ${id}: ${result.outcome}`);
      } catch (error) {
        summary.failed += 1;
        summary.items.push({ app: key, id, outcome: 'failed', error: error.message });
        log(`${key} ${id}: FAILED — ${error.message}`);
      }
    }
  }
  return summary;
};

module.exports = { eraseAccount, findDue, processDueDeletions };

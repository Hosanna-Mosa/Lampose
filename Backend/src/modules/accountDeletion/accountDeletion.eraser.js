/* ══════════════════════════════════════════════════════════════════════════
   Deleting an account — at once, with a copy kept apart.

   `deleteAccountNow` is the ONE way an account is deleted, whichever door the
   person used: Profile → Delete account in any of the four apps, the public
   page, or a request made before deletion became immediate and still sitting
   in the worker's queue. In order:

     1. The open work is counted (a stay still running, an order on a bike).
        It is RECORDED, not a reason to wait — deletion does not postpone.
     2. The account row as it stands, and the side records step 3 removes, are
        copied once into `deleted_account_archives` (see its model for what is
        and is not copied). If this write fails, nothing is erased.
     3. The live row is erased — see below.
     4. The archive copy is marked completed.

   ## Erased, not removed

   The account ROW stays, emptied. Everything that identifies the person — name,
   number, email, addresses, documents, bank details, devices, location — is
   cleared, and the row is left holding its id and `deletion.status:
   'completed'`. Two reasons it is not a `deleteOne`:

     · Orders, bookings, payouts and support threads point at the account by
       id. A dangling id is fine; a missing row that a controller `populate`s
       or `findOne`s is a 500 in somebody's order history.
     · The row is the proof the deletion happened, and when.

   The phone number is replaced with `deleted:<id>` rather than cleared: it is
   required and unique, and a placeholder frees the real number to register a
   NEW account while keeping the index valid. Every session the account held
   stops working at once — each app's guard answers ACCOUNT_GONE.

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
const DeletedAccountArchive = require('./deletedAccountArchive.model');

const placeholder = (id) => `deleted:${id}`;

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

/* The `deletion` sub-document the erased row is left holding. `request` is
   when and from where it was asked — for an immediate deletion, `now`. */
const completedDeletion = (request, now) => ({
  status: 'completed',
  requestedAt: request.requestedAt || now,
  scheduledFor: request.scheduledFor || now,
  cancelledAt: null,
  processedAt: now,
  /* Free text and a contact address are personal data too — they are in the
     archive copy, not on the emptied row. */
  reason: '',
  contactEmail: '',
  source: request.source || '',
});

/* One per audience: the side records the eraser DELETES outright, read first
   so the archive holds them. Records the eraser keeps (bookings, orders,
   support threads) are not copied — they are still where they were. */
const RELATED = {
  customer: async () => ({}),
  partner: async (doc) => {
    const { PartnerPaymentMethod, PartnerStaff, PartnerNotification } = require('../partners/partnerDomains.model');
    const digits = doc.phoneDigits;
    if (!digits) return {};
    const [paymentMethods, staff, notifications] = await Promise.all([
      PartnerPaymentMethod.find({ partnerPhoneDigits: digits }).lean(),
      PartnerStaff.find({ partnerPhoneDigits: digits }).lean(),
      PartnerNotification.find({ partnerPhoneDigits: digits }).lean(),
    ]);
    return { paymentMethods, staff, notifications };
  },
  restaurant: async (doc) => {
    const FoodProduct = require('../foodpartners/foodProduct.model');
    return { dishes: await FoodProduct.find({ restaurantId: doc.restaurantId }).lean() };
  },
  driver: async () => ({}),
};

/* One per audience: the fields that identify the person, and the side
   collections that exist only for them. */
const ERASERS = {
  customer: async (doc, now, request) => {
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
        deletion: completedDeletion(request, now),
      },
      $unset: { saved: '', foodFavourites: '', otp: '' },
      /* Every token issued to this account stops working at once. */
      $inc: { sessionVersion: 1 },
    });
    return { supportThreads: await scrubSupport('customer', doc.customerId, { customerId: doc.customerId }) };
  },

  partner: async (doc, now, request) => {
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
        deletion: completedDeletion(request, now),
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

  restaurant: async (doc, now, request) => {
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
        deletion: completedDeletion(request, now),
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

  driver: async (doc, now, request) => {
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
        deletion: completedDeletion(request, now),
      },
      $unset: { address: '', vehicle: '', payout: '', currentLocation: '', otp: '' },
    });
    return { supportThreads: await scrubSupport('driver', doc.driverId) };
  },
};

const plain = (doc) => (typeof doc.toObject === 'function' ? doc.toObject({ depopulate: true }) : { ...doc });

/**
 * Delete one account now: archive it, then erase it.
 *
 * `request` says who asked and how — `{ source, reason, contactEmail,
 * requestedAt }`. Returns `{ outcome: 'erased' | 'skipped', … }`:
 *
 *   erased    the archive copy exists and the live row is emptied.
 *   skipped   a store review account (never erased — the next reviewer needs
 *             it), or an account that is already deleted.
 *
 * Throws only when a write fails. The archive is written FIRST, so a failure
 * can never leave an erased account with no copy; a failure after it leaves a
 * `pending` copy and the account intact, and asking again deletes it.
 */
const deleteAccountNow = async (audienceKey, doc, request = {}, { now = new Date() } = {}) => {
  const audience = AUDIENCES[audienceKey];
  if (!audience) return { outcome: 'skipped', reason: 'unknown audience' };
  if (doc.deletion && doc.deletion.status === 'completed') {
    return { outcome: 'skipped', reason: 'already deleted' };
  }
  /* A store reviewer trying the delete button must not take the review
     account away from the next reviewer. */
  if (isReviewAccount(audienceKey, doc)) return { outcome: 'skipped', reason: 'review account' };

  let openWork = {};
  try {
    openWork = await audience.activeWork(doc);
  } catch {
    /* Counting is a record, not a condition — a failed count is not worth
       failing somebody's deletion over. */
  }

  const account = plain(doc);
  const archive = await DeletedAccountArchive.create({
    app: audienceKey,
    accountId: audience.idOf(doc),
    accountObjectId: doc._id,
    phone: String(audience.phoneOf(doc) || ''),
    name: account.name || account.ownerName || '',
    account: DeletedAccountArchive.stripCredentials(account),
    related: await RELATED[audienceKey](doc),
    openWork,
    source: request.source || '',
    reason: request.reason || '',
    contactEmail: request.contactEmail || '',
    status: 'pending',
    deletedAt: now,
  });

  const removed = await ERASERS[audienceKey](doc, now, {
    requestedAt: request.requestedAt || now,
    scheduledFor: now,
    source: request.source || '',
  });

  await DeletedAccountArchive.updateOne(
    { _id: archive._id },
    { $set: { status: 'completed', completedAt: new Date() } },
  );

  console.log(
    `🗑️  [Account Deletion] ${audienceKey} ${audience.idOf(doc)} deleted from ${request.source || 'unknown'}`
    + ` — archived as ${archive._id}`,
  );
  return { outcome: 'erased', removed, openWork, archiveId: String(archive._id), deletedAt: now };
};

/**
 * A request written before deletion became immediate, carried out now.
 *
 * Those requests were scheduled days out; they are honoured on the worker's
 * next sweep through the same `deleteAccountNow`, so they are archived too.
 * Anything that is not a standing, due request is left alone.
 */
const eraseAccount = async (audienceKey, doc, { now = new Date() } = {}) => {
  const d = doc.deletion || {};
  if (!AUDIENCES[audienceKey]) return { outcome: 'skipped', reason: 'unknown audience' };
  if (d.status !== 'requested') return { outcome: 'skipped', reason: `status is ${d.status || 'none'}` };
  if (!d.scheduledFor || new Date(d.scheduledFor) > now) return { outcome: 'skipped', reason: 'not due yet' };
  return deleteAccountNow(audienceKey, doc, {
    source: d.source,
    reason: d.reason,
    contactEmail: d.contactEmail,
    requestedAt: d.requestedAt,
  }, { now });
};

/** Every request whose date has passed, per audience, oldest first. */
const findDue = (audienceKey, { now = new Date(), limit = 50 } = {}) => AUDIENCES[audienceKey].model()
  .find({ 'deletion.status': 'requested', 'deletion.scheduledFor': { $lte: now } })
  .sort({ 'deletion.scheduledFor': 1 })
  .limit(limit);

/**
 * One sweep across all four audiences, for requests still queued from before
 * deletion was immediate. Used by the worker and by
 * `scripts/process-account-deletions.js`; `dryRun` reports what WOULD happen.
 */
const processDueDeletions = async ({ now = new Date(), dryRun = false, log = () => {} } = {}) => {
  const summary = { erased: 0, skipped: 0, failed: 0, items: [] };

  for (const key of Object.keys(AUDIENCES)) {
    const due = await findDue(key, { now });
    for (const doc of due) {
      const id = AUDIENCES[key].idOf(doc);
      try {
        if (dryRun) {
          const outcome = isReviewAccount(key, doc) ? 'skipped' : 'would erase';
          summary.items.push({ app: key, id, outcome });
          log(`${key} ${id}: ${outcome}`);
          continue;
        }
        const result = await eraseAccount(key, doc, { now });
        if (result.outcome === 'erased') summary.erased += 1;
        else summary.skipped += 1;
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

module.exports = { deleteAccountNow, eraseAccount, findDue, processDueDeletions };

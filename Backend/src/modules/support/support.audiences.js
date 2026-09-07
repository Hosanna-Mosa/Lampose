/* ══════════════════════════════════════════════════════════════════════════
   Who is allowed to file a support ticket, and what they may file it about.

   Three apps reach the support queue — the diner's, the rider's and the
   kitchen's — and they are three DIFFERENT audiences with three different
   lists of things that go wrong. A diner's worst day is a withheld deposit; a
   rider's is a payout that did not land; a kitchen's is a payment settlement
   or a rider who never came. Offering all three lists to all three apps would
   put "Deposit" in front of a delivery rider and "Payout" in front of a
   student, and a category list nobody recognises is a category list everybody
   answers with "Other" — which is how a queue stops being sortable.

   ## Why this is a registry and not three enums in three files

   The categories are needed in four places: the model validates against them,
   each app's screen draws them, the admin queue filters by them, and the
   verify script asserts them. Four copies of a list is four chances for one to
   drift, and the symptom of drift here is silent — a category the app offers
   and the server rejects shows a student "please choose what this is about"
   for a choice they just made.

   So one object, exported, and every other file reads it.

   ## The `kind` values are the ones the tokens already use

   `customer`, `driver` and `restaurant` are exactly the three `KIND_OF_TYPE`
   values `realtime.js` derives from a JWT's `typ` claim. That is not a
   coincidence to be tidied away later: it means a socket's identity and a
   ticket's owner are the same word, so "may this socket read this thread" is a
   string comparison rather than a mapping table that can be got wrong.

   ## Reports are the diner's alone, on purpose

   A safety report is an allegation about a PERSON — an owner withholding a
   deposit, harassment at a viewing — and it exists because a student in that
   position has no other lever. A rider or a restaurant reporting somebody is a
   real thing, but it is a different process with different consequences
   (a rider accusing a diner is also a rider who wants to be paid for the trip),
   and giving them the diner's form would put those allegations into the safety
   queue under reasons written for a tenancy. So `reports: false` for both, and
   they raise the same facts as a ticket in their own category until somebody
   designs that process properly.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The diner's six. Unchanged from the original stay-side support screen —
 * these strings are already in `User App/types/support.ts` and in tickets
 * sitting in the database, so they are not renamed here.
 */
const CUSTOMER_CATEGORIES = ['property', 'deposit', 'payment', 'owner', 'booking', 'other'];

/**
 * The rider's six.
 *
 * `payout` and `earnings` are deliberately separate. "I was paid the wrong
 * amount for trip 4821" and "my weekly settlement has not arrived" go to
 * different people and have different urgencies, and a rider who cannot tell
 * the queue which one it is gets routed by whoever picks the ticket up.
 */
const DRIVER_CATEGORIES = ['payout', 'earnings', 'order', 'account', 'app', 'safety', 'other'];

/**
 * The kitchen's six.
 *
 * `settlement` is the restaurant's equivalent of the rider's `payout`, named
 * differently because that is the word on their side of the contract, and a
 * category list that uses our internal vocabulary rather than theirs is one
 * they read twice.
 */
const RESTAURANT_CATEGORIES = ['settlement', 'order', 'menu', 'rider', 'account', 'app', 'other'];

/**
 * The Stay Partner owner's own six — what THEY may open a ticket about.
 *
 * A separate list from the diner's, for the same reason the rider's and the
 * kitchen's are: an owner's worst day is a payout that did not land or a
 * guest KYC upload that failed, not a deposit dispute — that one arrives the
 * other way round, as a ticket a STUDENT filed under `property`, which this
 * audience never files and instead reads because it names them (see
 * `linkedPartnerId` on the ticket model). `guest` is deliberately narrow:
 * a problem with one guest's booking, account or documents, as opposed to
 * `listing`, which is the property record itself.
 */
const PARTNER_CATEGORIES = ['payout', 'booking', 'guest', 'listing', 'account', 'app', 'other'];

/**
 * The three audiences.
 *
 * `label` is what the admin queue shows on a row — the person working the
 * queue needs to know in one glance whether they are answering a student or a
 * restaurant, because the tone, the urgency and the fix are all different.
 */
const AUDIENCES = {
  customer: {
    kind: 'customer',
    label: 'Diner',
    categories: CUSTOMER_CATEGORIES,
    /* Only the diner may file a safety report. See the header. */
    reports: true,
  },
  driver: {
    kind: 'driver',
    label: 'Rider',
    categories: DRIVER_CATEGORIES,
    reports: false,
  },
  restaurant: {
    kind: 'restaurant',
    label: 'Restaurant',
    categories: RESTAURANT_CATEGORIES,
    reports: false,
  },
  partner: {
    kind: 'partner',
    label: 'Owner',
    categories: PARTNER_CATEGORIES,
    reports: false,
  },
};

const REQUESTER_KINDS = Object.keys(AUDIENCES);

/**
 * Every category any audience may use, de-duplicated.
 *
 * This is what the MODEL's enum is built from, because a mongoose enum cannot
 * depend on a sibling field's value. The per-audience check — "may a rider
 * file this under `deposit`?" — is a separate assertion in the controller,
 * where the requester's kind is known. Both are needed: the enum stops a
 * category nobody offers, the controller stops a category the WRONG app
 * offered.
 */
const ALL_CATEGORIES = Array.from(
  new Set([
    ...CUSTOMER_CATEGORIES, ...DRIVER_CATEGORIES, ...RESTAURANT_CATEGORIES, ...PARTNER_CATEGORIES,
  ]),
);

/** The audience record for a kind, or null. */
const audienceOf = (kind) => AUDIENCES[String(kind || '')] || null;

/** May this audience file under this category? */
const allowsCategory = (kind, category) => {
  const audience = audienceOf(kind);
  return !!audience && audience.categories.includes(String(category || ''));
};

/** May this audience file a safety report at all? */
const allowsReports = (kind) => !!(audienceOf(kind) && audienceOf(kind).reports);

module.exports = {
  AUDIENCES,
  REQUESTER_KINDS,
  ALL_CATEGORIES,
  CUSTOMER_CATEGORIES,
  DRIVER_CATEGORIES,
  RESTAURANT_CATEGORIES,
  PARTNER_CATEGORIES,
  audienceOf,
  allowsCategory,
  allowsReports,
};

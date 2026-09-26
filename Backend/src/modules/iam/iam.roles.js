/* ══════════════════════════════════════════════════════════════════════════
   The console's permission table — the ONE place that says what a role may do.

   ## Why a table and not a Set per router

   Before this file, every admin router carried its own `new Set([...roles])`
   — `DECIDING_ROLES` in the food and rider queues, `ANSWERING_ROLES` in
   support, a local `requireRoles(...)` in the
   monitor and refunds — and the console mirrored each of them by hand in
   `Sidebar.tsx` and once more in each page. Six copies of "who may do what"
   is six ways for the answer to drift, and a role added in one place and
   forgotten in another is how a Viewer ends up with a Withdraw button that
   the server then refuses, or worse, accepts.

   Every guard now asks this table through `iam.middleware.js`, the login
   response hands the console the same table's answer for the signed-in role
   (`capabilities`), and the console shows or hides by that list. One source.

   ## Reading the table

   A CAPABILITY is a verb the console can perform — `money.release`,
   `support.answer`. A ROLE is a job title. The table says which titles may
   perform which verb. Routes are guarded by capability, never by role name,
   so giving a job a new power is one line here and nothing anywhere else.

   The sets below reproduce EXACTLY what each router enforced before, with
   three deliberate changes, each closing a hole rather than widening one:

     · `admins.*`    — the administrator accounts routes had NO guard at all.
     · `stats.read`  — the dashboard, activity feed and system telemetry had
                       NO guard at all. `system.read` is narrower because that
                       route lists the verification team's phone numbers.
     · `messaging.send` — sending WhatsApp to a real number was any signed-in
                       administrator, Viewer included. Now Admin and up.

   `Editor` and `Viewer` existed as role names with nothing behind them. They
   mean something now: an Editor works the property records without touching
   money or accounts; a Viewer reads everything and changes nothing.
   ══════════════════════════════════════════════════════════════════════════ */

const ROLES = Object.freeze(['Super Admin', 'Admin', 'Editor', 'Viewer', 'Food Admin', 'Support']);

const SUPER = ['Super Admin'];
const ADMINS = ['Super Admin', 'Admin'];
const EDITORS = ['Super Admin', 'Admin', 'Editor'];
const EVERYONE = [...ROLES];

const CAPABILITIES = Object.freeze({
  /* ── Reading the console ─────────────────────────────────────────────── */
  'console.read': { roles: EVERYONE, label: 'open the console' },
  'stats.read': { roles: EVERYONE, label: 'read the dashboard and activity feed' },
  'analytics.read': { roles: EVERYONE, label: 'read website analytics' },
  'system.read': { roles: ADMINS, label: 'read system telemetry' },

  /* ── Accounts ────────────────────────────────────────────────────────── */
  'admins.read': { roles: ADMINS, label: 'list administrator accounts' },
  'admins.manage': { roles: SUPER, label: 'create, change or remove administrator accounts' },

  /* ── Supply: properties, verification, field-agent grants ────────────── */
  'properties.write': { roles: EDITORS, label: 'create, edit or delete property records' },
  'verifications.manage': { roles: EDITORS, label: 'change verification requests' },
  'permissions.decide': { roles: ADMINS, label: 'approve or refuse a field agent’s edit request' },

  /* ── Money ───────────────────────────────────────────────────────────── */
  'money.read': { roles: EVERYONE, label: 'read bookings, payments, payouts and refunds' },
  'commission.set': { roles: ADMINS, label: 'set a settlement’s commission' },
  'money.release': { roles: SUPER, label: 'release, pay out or refund money' },
  'food.refund': { roles: ADMINS, label: 'refund a food order' },
  'food.complete': { roles: ADMINS, label: 'mark a website food order delivered' },
  /* The same operators who put a rider on the road take their cash back in. */
  'riders.cash': {
    roles: ['Super Admin', 'Admin', 'Food Admin'],
    label: 'record cash a rider has handed over',
  },

  /* ── Queues ──────────────────────────────────────────────────────────── */
  'food.decide': { roles: ['Super Admin', 'Admin', 'Food Admin'], label: 'approve or refuse a restaurant' },
  'riders.decide': { roles: ['Super Admin', 'Admin', 'Food Admin'], label: 'approve, refuse or suspend a rider' },
  'support.answer': { roles: ['Super Admin', 'Admin', 'Support'], label: 'answer support tickets' },
  'messaging.send': { roles: ADMINS, label: 'send WhatsApp messages from the console' },

  /* ── Raw collections ─────────────────────────────────────────────────── */
  'database.manage': { roles: SUPER, label: 'edit raw collections (visit requests, leads panel, products)' },
});

const CAPABILITY_NAMES = Object.freeze(Object.keys(CAPABILITIES));

const assertKnown = (capability) => {
  if (!CAPABILITIES[capability]) {
    throw new Error(`Unknown capability "${capability}" — add it to iam.roles.js before guarding a route with it.`);
  }
  return CAPABILITIES[capability];
};

/** May this role perform this capability? Unknown capabilities throw at load. */
const roleCan = (role, capability) => assertKnown(capability).roles.includes(role);

/** Every capability a role has — what the login response hands the console. */
const capabilitiesFor = (role) => CAPABILITY_NAMES.filter((name) => CAPABILITIES[name].roles.includes(role));

/** The roles that hold a capability, for messages and for the old exported Sets. */
const rolesWith = (capability) => [...assertKnown(capability).roles];

/** A human phrase for a refusal: "This action needs to release money." */
const describe = (capability) => assertKnown(capability).label;

module.exports = {
  ROLES, CAPABILITIES, CAPABILITY_NAMES, roleCan, capabilitiesFor, rolesWith, describe,
};

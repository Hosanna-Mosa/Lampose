/* ══════════════════════════════════════════════════════════════════════════
   `admin_audit_log` — who did what, to whose money, and when.

   ## Why this exists at all

   The console already has an activity feed (`GET /api/admin/activity`), and it
   is not this. That one is DERIVED: it reads properties, verifications and
   bookings and describes what those records look like now. It can tell you a
   payout happened; it cannot tell you who released it, what the commission was
   before somebody changed it, or that a release was attempted and refused.

   A derived feed can only ever report the current state of a record. An audit
   log is the opposite: it is written at the moment of the act, it records the
   BEFORE as well as the after, and nothing that happens later can rewrite it.
   For money moving out of a Razorpay account to a third party, that difference
   is the whole point.

   ## Append-only, in practice as well as in intent

   Nothing in this codebase updates or deletes a row here — there is no method
   to do it and no route that could. `record()` is the only writer.

   ## It never blocks the thing it is recording

   `record()` swallows its own failures. That is deliberate and it is the right
   way round: a payout that succeeded at Razorpay must not be reported as
   failed because a log write did. A missing audit row is a gap in the story; a
   false failure is a person pressing Withdraw a second time.

   The trade is stated rather than hidden — if audit completeness ever has to
   be guaranteed, the write belongs inside the same transaction as the state
   change, and that is a different design from this one.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');

/**
 * The acts worth recording. An enum rather than free text so the log can be
 * filtered, and so adding a new sensitive action is a deliberate edit here
 * rather than a string somebody invented at a call site.
 */
const AUDIT_ACTIONS = [
  /* Money */
  'settlement.commission_changed',
  'settlement.withdraw_requested',
  'settlement.withdraw_succeeded',
  'settlement.withdraw_failed',
  'settlement.reversed',
  /* The offline half — PG/Hostel and Co-living commission, collected by hand */
  'booking.commission_collected',
  /* Stay Partner payouts paid by a person making a bank transfer. `record`
     swallows its own failures by design, so an action missing from this list
     is not an error anywhere — it is simply never written, which is the worst
     way for an audit trail to have a hole. */
  'partner_payout.marked_paid',
  'partner_payout.rejected',
  /* Guest refunds, paid by a person making a bank transfer. */
  'refund.marked_paid',
  'refund.rejected',
  /* Policy */
  'cancellation_policy.changed',
  /* Accounts — who may open the console, and with what power. */
  'admin.bootstrapped',
  'admin.created',
  'admin.updated',
  'admin.deleted',
  'admin.password_changed',
  'admin.signed_out_everywhere',
];

const adminAuditLogSchema = new mongoose.Schema(
  {
    /*
     * Who. Both the id and a snapshot of the name and role.
     *
     * The id alone would be correct and useless: an administrator can be
     * renamed, demoted or removed, and the question an audit answers is "who
     * was this, as they were, at that moment". The snapshot is the answer; the
     * id is how you find them if they still exist.
     */
    adminId: { type: String, required: true, index: true },
    adminName: { type: String, default: '' },
    adminEmail: { type: String, default: '' },
    adminRole: { type: String, default: '' },

    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },

    /** What it was done to — `hotel_settlements`, `partner_bookings`, … */
    targetType: { type: String, required: true },
    targetId: { type: String, required: true, index: true },

    /*
     * The change itself, as two small objects.
     *
     * `before` is what makes this an audit rather than a notification. "The
     * commission is 5%" is a fact anybody can read off the row; "it was 12%
     * and Priya made it 5% four minutes before releasing it" is the thing
     * somebody actually needs, and only a record written at the time can say
     * it.
     *
     * Deliberately `Mixed` and deliberately small: the fields that changed,
     * never the whole document. A full snapshot would put a guest's phone
     * number into a second collection with a different retention rule.
     */
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    /* Where from. Weak evidence on its own — a proxy header can be set by
       anybody upstream — but it is what turns "this account did it" into
       "this account did it from somewhere it never usually works". */
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    /* Set only on the failing actions, so a refusal is as findable as a
       success. A payout that was attempted and refused is exactly the row
       somebody goes looking for. */
    errorCode: { type: String, default: '' },
    errorMessage: { type: String, default: '' },
  },
  { timestamps: true, collection: 'admin_audit_log' },
);

/* The two questions asked of this collection: what happened to this record,
   and what has this administrator been doing. */
adminAuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });

const AdminAuditLog = mongoose.models.AdminAuditLog
  || mongoose.model('AdminAuditLog', adminAuditLogSchema);

/**
 * Write one entry. Never throws — see the header.
 *
 * `req` is passed rather than its pieces so a call site cannot forget the IP
 * or misspell the admin fields; everything about WHO is read from
 * `req.admin`, which `verifyAdminToken` attached after verifying the token
 * against the `admins` collection. A caller cannot claim to be somebody else,
 * because it is not the caller saying who it is.
 */
const record = async (req, {
  action, targetType, targetId, before = null, after = null,
  errorCode = '', errorMessage = '',
}) => {
  try {
    const admin = req && req.admin;
    if (!admin) {
      console.warn(`[audit] "${action}" had no authenticated admin on the request — not recorded.`);
      return null;
    }

    return await AdminAuditLog.create({
      adminId: String(admin._id),
      adminName: admin.name || '',
      adminEmail: admin.email || '',
      adminRole: admin.role || '',
      action,
      targetType,
      targetId: String(targetId),
      before,
      after,
      /* `req.ip` respects Express's trust-proxy setting; the header is the
         fallback for a deployment that has not set one. */
      ip: req.ip || req.headers?.['x-forwarded-for'] || '',
      userAgent: String(req.headers?.['user-agent'] || '').slice(0, 300),
      errorCode,
      errorMessage: String(errorMessage || '').slice(0, 400),
    });
  } catch (error) {
    /* The one place this is allowed to fail quietly. A payout that reached
       Razorpay must not be reported as failed because a log write did. */
    console.error('[audit] could not record', action, error.message);
    return null;
  }
};

module.exports = { AdminAuditLog, AUDIT_ACTIONS, record };

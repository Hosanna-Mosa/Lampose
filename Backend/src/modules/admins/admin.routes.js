/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin — the console's accounts: who may sign in, and as what.

   ## What changed, and why it was urgent

   Every route in this file used to be reachable with no token at all:
   `GET /users` listed every administrator's email, `PUT /users/:id` set any
   account's role to Super Admin, `DELETE /users/:id` removed one, and
   `POST /register` created one for anybody holding the secret key, with a
   role of their choosing. The console gated its OWN buttons by role and
   the server gated nothing.

   Now:

     GET  /bootstrap                public — is there an administrator yet?
     POST /register                 public, ONLY while there is none; the
                                    account it creates is the first Super
                                    Admin. After that it answers 403 and every
                                    account is made from the console.
     POST /login                    public, rate-limited by IP and by email
     GET  /me                       signed in — the account, and what it may do
     POST /me/password              signed in — change password (revokes every
                                    other session of this account)
     POST /me/sign-out-everywhere   signed in
     GET  /users                    admins.read     (Super Admin, Admin)
     POST /users                    admins.manage   (Super Admin)
     PUT  /users/:id                admins.manage — never yourself, never the
                                    last active Super Admin
     DELETE /users/:id              admins.manage — same two rules

   A role or status change bumps the target's `sessionVersion`, so a demoted
   administrator's open tab loses the power on its next request rather than
   keeping it for the rest of the token's life.

   The capability names come from `iam/iam.roles.js`; the token from
   `adminToken.js`.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');

const Admin = require('./admin.model');
const { signAdminToken } = require('./adminToken');
const verifyAdminToken = require('../analytics/verifyAdminToken.middleware');
const { can } = require('../iam/iam.middleware');
const { ROLES, capabilitiesFor } = require('../iam/iam.roles');
const { rateLimit } = require('../../shared/middleware/rateLimit');
const audit = require('./adminAuditLog.model');

const router = express.Router();

const STATUSES = ['Active', 'Inactive', 'Pending'];
const MIN_PASSWORD = 8;

const present = (admin) => ({
  id: admin._id.toString(),
  name: admin.name,
  email: admin.email,
  role: admin.role,
  status: admin.status,
  avatar: admin.avatar,
  createdAt: admin.createdAt ? new Date(admin.createdAt).toISOString() : null,
  lastLogin: admin.lastLogin,
});

/** The login/register response — the console stores all three. */
const session = (admin) => ({
  token: signAdminToken(admin),
  user: present(admin),
  capabilities: capabilitiesFor(admin.role),
});

const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const emailKey = (req) => String((req.body && req.body.email) || '').trim().toLowerCase() || req.ip;
const loginByIp = rateLimit({ name: 'admin-login-ip', windowMs: 15 * 60 * 1000, max: 30 });
const loginByEmail = rateLimit({ name: 'admin-login-email', windowMs: 15 * 60 * 1000, max: 10, keyOf: emailKey });
const registerByIp = rateLimit({ name: 'admin-register-ip', windowMs: 60 * 60 * 1000, max: 10 });

const activeSuperAdmins = () => Admin.countDocuments({ role: 'Super Admin', status: 'Active' });

/* ── Bootstrap ─────────────────────────────────────────────────────────── */

/**
 * @route   GET /api/v1/admin/bootstrap
 * @desc    Whether the console still needs its first administrator. The login
 *          page shows the "register" link only while this is true.
 * @access  Public — it answers a boolean and nothing else.
 */
router.get('/bootstrap', async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    return res.json({ success: true, needsBootstrap: count === 0 });
  } catch (error) {
    console.error('❌ [Admin Bootstrap Check Error]', error);
    return fail(res, 500, 'FAILED', 'Could not check the administrator accounts.');
  }
});

/**
 * @route   POST /api/v1/admin/register
 * @desc    Create the FIRST administrator. Refused once any exists.
 * @access  Public, guarded by V1_ADMIN_SECRET_KEY and by there being no account yet.
 */
router.post('/register', registerByIp, async (req, res) => {
  try {
    const { name, email, password, adminSecretKey } = req.body;

    if (!name || !email || !password || !adminSecretKey) {
      return fail(res, 400, 'VALIDATION', 'Name, email, password, and the Admin Secret Key are required.');
    }

    /* V1_ADMIN_SECRET_KEY, not ADMIN_SECRET_KEY. The latter guards ADMIN
       registration on the *other* identity system (/api/v2/auth/register,
       scriper_users). Unset compares as '', which can never match (an empty
       adminSecretKey is rejected above), so bootstrap is simply refused until
       the key is configured. */
    const envSecretKey = process.env.V1_ADMIN_SECRET_KEY || '';
    if (String(adminSecretKey).trim() !== envSecretKey.trim()) {
      console.warn(`⚠️ [Admin Register] Secret key mismatch attempt for email: ${email}`);
      return fail(res, 403, 'BAD_SECRET', 'Invalid Mandatory Admin Secret Key. Please provide a valid admin secret key.');
    }

    if (await Admin.countDocuments() > 0) {
      return fail(
        res, 403, 'BOOTSTRAP_DONE',
        'The console already has administrators. New accounts are created from Administrators by a Super Admin.',
      );
    }

    if (String(password).length < MIN_PASSWORD) {
      return fail(res, 400, 'VALIDATION', `Use a password of at least ${MIN_PASSWORD} characters.`);
    }

    const newAdmin = await Admin.create({
      name,
      email: String(email).toLowerCase(),
      password,
      role: 'Super Admin',
      status: 'Active',
      lastLogin: `${new Date().toLocaleTimeString()} ${new Date().toLocaleDateString()}`,
    });

    console.log(`✅ [Admin Bootstrapped] Created the first Super Admin: ${newAdmin.email}`);
    req.admin = newAdmin;
    await audit.record(req, {
      action: 'admin.bootstrapped', targetType: 'admins', targetId: String(newAdmin._id), after: present(newAdmin),
    });

    return res.status(201).json({ success: true, message: 'Admin registered successfully.', ...session(newAdmin) });
  } catch (error) {
    console.error('❌ [Admin Register Error]', error);
    return fail(res, 500, 'FAILED', error.message || 'Server error during registration.');
  }
});

/* ── Sign in ───────────────────────────────────────────────────────────── */

/**
 * @route   POST /api/v1/admin/login
 * @access  Public, rate-limited
 */
router.post('/login', loginByIp, loginByEmail, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return fail(res, 400, 'VALIDATION', 'Please provide email and password.');

    const admin = await Admin.findOne({ email: String(email).toLowerCase() });
    if (!admin) return fail(res, 401, 'BAD_CREDENTIALS', 'Invalid email or password credentials.');

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) return fail(res, 401, 'BAD_CREDENTIALS', 'Invalid email or password credentials.');

    /* Checked at sign-in as well as on every request, so a deactivated
       account gets a sentence rather than a token that refuses everything. */
    if (admin.status !== 'Active') {
      return fail(res, 403, 'ACCOUNT_INACTIVE', 'This administrator account is not active. Ask a Super Admin to reactivate it.');
    }

    admin.lastLogin = 'Just now';
    await admin.save();

    console.log(`🔑 [Admin Login Success] ${admin.role}: ${admin.email}`);
    return res.json({ success: true, message: 'Login successful.', ...session(admin) });
  } catch (error) {
    console.error('❌ [Admin Login Error]', error);
    return fail(res, 500, 'FAILED', error.message || 'Server error during login.');
  }
});

/* ── The signed-in account ─────────────────────────────────────────────── */

/**
 * @route   GET /api/v1/admin/me
 * @desc    The account as it is NOW — role, status and capabilities — so the
 *          console refreshes what it may show without a second sign-in.
 */
router.get('/me', verifyAdminToken, (req, res) => res.json({
  success: true, user: present(req.admin), capabilities: req.capabilities,
}));

/**
 * @route   POST /api/v1/admin/me/password
 * @desc    Change your own password. The model bumps `sessionVersion` on a
 *          password change, so every OTHER session of this account is signed
 *          out; the response carries a fresh token for this one.
 */
router.post('/me/password', verifyAdminToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return fail(res, 400, 'VALIDATION', 'Both the current and the new password are required.');
    }
    if (String(newPassword).length < MIN_PASSWORD) {
      return fail(res, 400, 'VALIDATION', `Use a password of at least ${MIN_PASSWORD} characters.`);
    }

    const admin = await Admin.findById(req.admin._id);
    if (!admin) return fail(res, 401, 'UNAUTHORIZED', 'This administrator account no longer exists.');
    if (!(await admin.matchPassword(currentPassword))) {
      return fail(res, 403, 'BAD_CREDENTIALS', 'The current password is not right.');
    }

    admin.password = String(newPassword);
    await admin.save();

    await audit.record(req, { action: 'admin.password_changed', targetType: 'admins', targetId: String(admin._id) });
    console.log(`🔐 [Admin Password Changed] ${admin.email}`);
    return res.json({ success: true, message: 'Password changed. Other sessions of this account were signed out.', ...session(admin) });
  } catch (error) {
    console.error('❌ [Admin Password Change Error]', error);
    return fail(res, 500, 'FAILED', error.message || 'Could not change the password.');
  }
});

/**
 * @route   POST /api/v1/admin/me/sign-out-everywhere
 * @desc    Revoke every token this account holds, including the one used to call this.
 */
router.post('/me/sign-out-everywhere', verifyAdminToken, async (req, res) => {
  try {
    await Admin.updateOne({ _id: req.admin._id }, { $inc: { sessionVersion: 1 } });
    await audit.record(req, { action: 'admin.signed_out_everywhere', targetType: 'admins', targetId: String(req.admin._id) });
    return res.json({ success: true, message: 'Signed out everywhere.' });
  } catch (error) {
    console.error('❌ [Admin Sign-out Everywhere Error]', error);
    return fail(res, 500, 'FAILED', 'Could not sign out the other sessions.');
  }
});

/* ── Administrator accounts ────────────────────────────────────────────── */

/**
 * @route   GET /api/v1/admin/users
 * @access  admins.read
 */
router.get('/users', verifyAdminToken, can('admins.read'), async (req, res) => {
  try {
    const { search, status, role } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (status && status !== 'All') query.status = status;
    if (role && role !== 'All') query.role = role;

    const admins = await Admin.find(query).select('-password').sort({ createdAt: -1 });
    const items = admins.map(present);

    return res.json({
      items, total: items.length, page: 1, pageSize: 50, totalPages: 1,
    });
  } catch (error) {
    console.error('❌ [Admin Fetch Users Error]', error);
    return fail(res, 500, 'FAILED', error.message || 'Error fetching admins from database.');
  }
});

/**
 * @route   POST /api/v1/admin/users
 * @access  admins.manage
 */
router.post('/users', verifyAdminToken, can('admins.manage'), async (req, res) => {
  try {
    const {
      name, email, password, role, status,
    } = req.body;

    if (!name || !email) return fail(res, 400, 'VALIDATION', 'Name and email are required.');
    /* A fixed default password was a published credential for every account
       made without one. The person creating the account chooses it. */
    if (!password || String(password).length < MIN_PASSWORD) {
      return fail(res, 400, 'VALIDATION', `Set a password of at least ${MIN_PASSWORD} characters for the new account.`);
    }
    if (role && !ROLES.includes(role)) return fail(res, 400, 'VALIDATION', `Role must be one of: ${ROLES.join(', ')}.`);
    if (status && !STATUSES.includes(status)) return fail(res, 400, 'VALIDATION', `Status must be one of: ${STATUSES.join(', ')}.`);

    const existing = await Admin.findOne({ email: String(email).toLowerCase() });
    if (existing) return fail(res, 400, 'DUPLICATE', 'An administrator with this email already exists.');

    const newAdmin = await Admin.create({
      name,
      email: String(email).toLowerCase(),
      password: String(password),
      role: role || 'Admin',
      status: status || 'Active',
    });

    await audit.record(req, {
      action: 'admin.created', targetType: 'admins', targetId: String(newAdmin._id), after: present(newAdmin),
    });
    console.log(`👤 [Admin Created] ${newAdmin.role}: ${newAdmin.email} by ${req.admin.email}`);
    return res.status(201).json(present(newAdmin));
  } catch (error) {
    console.error('❌ [Create Admin User Error]', error);
    return fail(res, 500, 'FAILED', error.message || 'Error creating user in database.');
  }
});

/**
 * @route   PUT /api/v1/admin/users/:id
 * @desc    Change name, role or status. Two rules: not your own role or
 *          status, and never the last active Super Admin's.
 * @access  admins.manage
 */
router.put('/users/:id', verifyAdminToken, can('admins.manage'), async (req, res) => {
  try {
    const { name, role, status } = req.body;
    if (role && !ROLES.includes(role)) return fail(res, 400, 'VALIDATION', `Role must be one of: ${ROLES.join(', ')}.`);
    if (status && !STATUSES.includes(status)) return fail(res, 400, 'VALIDATION', `Status must be one of: ${STATUSES.join(', ')}.`);

    const target = await Admin.findById(req.params.id).select('-password');
    if (!target) return fail(res, 404, 'NOT_FOUND', 'Administrator not found.');

    const isSelf = String(target._id) === String(req.admin._id);
    const changesPower = (role && role !== target.role) || (status && status !== target.status);
    if (isSelf && changesPower) {
      return fail(res, 403, 'SELF_CHANGE', 'You cannot change your own role or status. Ask another Super Admin.');
    }

    const losesTopRole = target.role === 'Super Admin' && target.status === 'Active'
      && ((role && role !== 'Super Admin') || (status && status !== 'Active'));
    if (losesTopRole && (await activeSuperAdmins()) <= 1) {
      return fail(res, 409, 'LAST_SUPER_ADMIN', 'This is the only active Super Admin. Promote somebody else first.');
    }

    const before = present(target);
    const updated = await Admin.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name }),
        ...(role && { role }),
        ...(status && { status }),
        /* A demotion or deactivation ends the account's open sessions now —
           the token they hold names a power they no longer have. */
        ...(changesPower && { $inc: { sessionVersion: 1 } }),
      },
      { new: true, runValidators: true },
    ).select('-password');

    await audit.record(req, {
      action: 'admin.updated', targetType: 'admins', targetId: String(updated._id), before, after: present(updated),
    });
    console.log(`✏️ [Admin Updated] ${updated.email} → ${updated.role} / ${updated.status} by ${req.admin.email}`);
    return res.json(present(updated));
  } catch (error) {
    console.error('❌ [Update Admin User Error]', error);
    return fail(res, 500, 'FAILED', error.message || 'Error updating administrator.');
  }
});

/**
 * @route   DELETE /api/v1/admin/users/:id
 * @access  admins.manage — not yourself, not the last active Super Admin
 */
router.delete('/users/:id', verifyAdminToken, can('admins.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const target = await Admin.findById(id).select('-password');
    if (!target) return fail(res, 404, 'NOT_FOUND', 'Administrator not found.');

    if (String(target._id) === String(req.admin._id)) {
      return fail(res, 403, 'SELF_CHANGE', 'You cannot delete your own account.');
    }
    if (target.role === 'Super Admin' && target.status === 'Active' && (await activeSuperAdmins()) <= 1) {
      return fail(res, 409, 'LAST_SUPER_ADMIN', 'This is the only active Super Admin. Promote somebody else first.');
    }

    await Admin.findByIdAndDelete(id);
    await audit.record(req, {
      action: 'admin.deleted', targetType: 'admins', targetId: String(id), before: present(target),
    });
    console.log(`🗑️ [Admin Deleted] ${target.email} by ${req.admin.email}`);
    return res.json({ success: true, message: 'Administrator deleted successfully.' });
  } catch (error) {
    console.error('❌ [Delete Admin User Error]', error);
    return fail(res, 500, 'FAILED', error.message || 'Error deleting admin from database.');
  }
});

module.exports = router;

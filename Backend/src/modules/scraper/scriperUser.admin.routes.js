/* ══════════════════════════════════════════════════════════════════════════
   Admin-console CRUD over `scriper_users` — the leads-panel's own accounts.

   user.routes.js (mounted at /api/v2/users) already does list/create/delete
   for this collection, but it is guarded by the *v2* JWT — a completely
   separate login from the `admins` collection this console authenticates
   against (see routes/index.js's header comment on the two merged backends).
   This console has no way to hold a v2 token, so that router is unreachable
   from here. This file gives the same collection a v1, Super-Admin-only path,
   plus the one operation the v2 side never had: editing an existing account.

   Goes through scraper.store.js rather than the User model directly, so it
   keeps working when the leads store is running in local-JSON mode instead
   of MongoDB (see that file's header comment).
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const router = express.Router();

const dbStore = require('./scraper.store');
const audit = require('../admins/adminAuditLog.model');
const requireSuperAdmin = require('../../shared/middleware/requireSuperAdmin');
const { requireScriperStore } = require('../../shared/middleware/requireDb');

router.use(requireSuperAdmin, requireScriperStore);

/*
 * A temporary password nobody has to remember, and nobody can guess.
 *
 * Both of the routes that create a staff account used to default to the
 * literal string `employee123` — and both consoles told the admin they could
 * leave the field blank to get it. So every account created the easy way
 * shared one password that is written down in the repository, in two UIs and
 * in this file's history. Combined with a staff login that had no rate limit
 * until today, that is not a weak password; it is a published one.
 *
 * Generated rather than required, because "you must type a password" is how an
 * admin ends up typing `employee123` themselves. The value is returned ONCE,
 * on the creation response, for the admin to hand over — it is never stored in
 * plaintext and there is no route that can read it back, exactly as
 * `updateUser`'s comment describes.
 *
 * base64url over 12 random bytes: 16 characters, no ambiguous punctuation to
 * misread down a phone line, and 96 bits of entropy.
 */
const crypto = require('crypto');

const newTemporaryPassword = () => crypto.randomBytes(12).toString('base64url');

const MIN_PASSWORD = 8;

// @route   GET /api/admin/scriper-users
router.get('/', async (req, res) => {
  try {
    const users = await dbStore.getUsers();
    return res.json({ success: true, count: users.length, data: users, items: users });
  } catch (error) {
    console.error('❌ [GET /api/admin/scriper-users Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching leads-panel users.' });
  }
});

// @route   POST /api/admin/scriper-users
router.post('/', async (req, res) => {
  try {
    const {
      name, email, password: given, role = 'EMPLOYEE', avatar,
    } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Both "name" and "email" are required.' });
    }

    /* Blank means "generate one", not "use the well-known one". */
    const generated = !String(given || '').trim();
    const password = generated ? newTemporaryPassword() : String(given);

    if (password.length < MIN_PASSWORD) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD} characters long.`,
      });
    }

    const user = await dbStore.createUser({ name, email, password, role, avatar });
    console.log(`✅ [Scriper User Created] "${user.email}" (${user.role})${generated ? ' · temporary password generated' : ''}`);
    await audit.record(req, {
      action: 'staff.created',
      targetType: 'scriper_users',
      targetId: user.userId,
      after: { name: user.name, email: user.email, role: user.role },
    });

    /* Returned once and only when WE made it up — echoing a password the admin
       chose would put it in a response body for no reason. */
    return res.status(201).json({
      success: true,
      message: 'User created.',
      data: generated ? { ...user, temporaryPassword: password } : user,
    });
  } catch (error) {
    console.error('❌ [POST /api/admin/scriper-users Error]:', error.message);
    if (/already exists/i.test(error.message)) {
      return res.status(409).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message || 'Error creating user.' });
  }
});

// @route   PUT /api/admin/scriper-users/:userId
router.put('/:userId', async (req, res) => {
  try {
    const { name, email, role, avatar, password } = req.body || {};
    if (password && String(password).length < MIN_PASSWORD) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${MIN_PASSWORD} characters long.`,
      });
    }
    const before = await dbStore.findUserById(req.params.userId);
    const updated = await dbStore.updateUser(req.params.userId, { name, email, role, avatar, password });
    if (!updated) return res.status(404).json({ success: false, message: 'User not found.' });

    console.log(`✏️ [Scriper User Updated] "${updated.email}"`);
    await audit.record(req, {
      action: 'staff.updated',
      targetType: 'scriper_users',
      targetId: updated.userId,
      before: before && { name: before.name, email: before.email, role: before.role },
      /* That a password was reset, never what it was reset to. */
      after: { name: updated.name, email: updated.email, role: updated.role, passwordReset: Boolean(password) },
    });
    return res.json({ success: true, message: 'User updated.', data: updated });
  } catch (error) {
    console.error(`❌ [PUT /api/admin/scriper-users/${req.params.userId} Error]:`, error.message);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'That email is already in use.' });
    }
    return res.status(500).json({ success: false, message: error.message || 'Error updating user.' });
  }
});

// @route   DELETE /api/admin/scriper-users/:userId
router.delete('/:userId', async (req, res) => {
  try {
    const before = await dbStore.findUserById(req.params.userId);
    const deleted = await dbStore.deleteUser(req.params.userId);
    if (!deleted) return res.status(404).json({ success: false, message: 'User not found.' });

    console.log(`🗑️ [Scriper User Deleted] ID: ${req.params.userId}`);
    await audit.record(req, {
      action: 'staff.deleted',
      targetType: 'scriper_users',
      targetId: req.params.userId,
      before: before && { name: before.name, email: before.email, role: before.role },
    });
    return res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    console.error(`❌ [DELETE /api/admin/scriper-users/${req.params.userId} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error deleting user.' });
  }
});

/*
 * Take somebody off the job without erasing them.
 *
 * The account stays — so their onboarding history stays attributed to a
 * person who still exists — but it cannot sign in, and every session it
 * already holds (the Onboard app on their phone, a leads-panel tab) is
 * refused at its next request. Reversible, unlike DELETE.
 */
// @route   POST /api/admin/scriper-users/:userId/suspend   { reason? }
router.post('/:userId/suspend', async (req, res) => {
  try {
    const reason = String((req.body && req.body.reason) || '').trim();
    const updated = await dbStore.setUserStatus(req.params.userId, { suspended: true, reason });
    if (!updated) return res.status(404).json({ success: false, message: 'User not found.' });

    console.log(`⛔ [Scriper User Suspended] "${updated.email}"${reason ? ` · ${reason}` : ''}`);
    await audit.record(req, {
      action: 'staff.suspended',
      targetType: 'scriper_users',
      targetId: updated.userId,
      before: { status: 'active' },
      after: { status: 'suspended', reason },
    });
    return res.json({ success: true, message: 'Account suspended and signed out everywhere.', data: updated });
  } catch (error) {
    console.error(`❌ [POST /api/admin/scriper-users/${req.params.userId}/suspend Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error suspending user.' });
  }
});

// @route   POST /api/admin/scriper-users/:userId/reactivate
router.post('/:userId/reactivate', async (req, res) => {
  try {
    const updated = await dbStore.setUserStatus(req.params.userId, { suspended: false });
    if (!updated) return res.status(404).json({ success: false, message: 'User not found.' });

    console.log(`✅ [Scriper User Reactivated] "${updated.email}"`);
    await audit.record(req, {
      action: 'staff.reactivated',
      targetType: 'scriper_users',
      targetId: updated.userId,
      before: { status: 'suspended' },
      after: { status: 'active' },
    });
    return res.json({ success: true, message: 'Account reactivated.', data: updated });
  } catch (error) {
    console.error(`❌ [POST /api/admin/scriper-users/${req.params.userId}/reactivate Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error reactivating user.' });
  }
});

/* Ends every open session but leaves the account usable — for a lost phone
   or a shared password, where suspending would be the wrong message. */
// @route   POST /api/admin/scriper-users/:userId/sign-out
router.post('/:userId/sign-out', async (req, res) => {
  try {
    const version = await dbStore.revokeSessions(req.params.userId);
    if (version === null) return res.status(404).json({ success: false, message: 'User not found.' });

    await audit.record(req, {
      action: 'staff.signed_out_everywhere',
      targetType: 'scriper_users',
      targetId: req.params.userId,
    });
    return res.json({ success: true, message: 'Signed out of every device.' });
  } catch (error) {
    console.error(`❌ [POST /api/admin/scriper-users/${req.params.userId}/sign-out Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error signing the user out.' });
  }
});

module.exports = router;

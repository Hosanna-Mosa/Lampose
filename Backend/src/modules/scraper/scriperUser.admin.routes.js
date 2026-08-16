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
const requireSuperAdmin = require('../../shared/middleware/requireSuperAdmin');
const { requireScriperStore } = require('../../shared/middleware/requireDb');

router.use(requireSuperAdmin, requireScriperStore);

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
    const { name, email, password = 'employee123', role = 'EMPLOYEE', avatar } = req.body || {};
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Both "name" and "email" are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const user = await dbStore.createUser({ name, email, password, role, avatar });
    console.log(`✅ [Scriper User Created] "${user.email}" (${user.role})`);
    return res.status(201).json({ success: true, message: 'User created.', data: user });
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
    const updated = await dbStore.updateUser(req.params.userId, { name, email, role, avatar, password });
    if (!updated) return res.status(404).json({ success: false, message: 'User not found.' });

    console.log(`✏️ [Scriper User Updated] "${updated.email}"`);
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
    const deleted = await dbStore.deleteUser(req.params.userId);
    if (!deleted) return res.status(404).json({ success: false, message: 'User not found.' });

    console.log(`🗑️ [Scriper User Deleted] ID: ${req.params.userId}`);
    return res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    console.error(`❌ [DELETE /api/admin/scriper-users/${req.params.userId} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error deleting user.' });
  }
});

module.exports = router;

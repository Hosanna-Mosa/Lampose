/* Team management for the leads panel (`scriper_users`). */
const dbStore = require('../scraper/scraper.store');

const fail = (res, status, message) => res.status(status).json({
  success: false,
  message,
  error: message,
});

// @route GET /api/v2/users
const getUsers = async (req, res, next) => {
  try {
    const users = await dbStore.getUsers();
    return res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    return next(error);
  }
};

// @route POST /api/v2/users
const createUser = async (req, res, next) => {
  try {
    const { name, email, password = 'employee123', role = 'EMPLOYEE', avatar } = req.body || {};

    if (!name || !email) {
      return fail(res, 400, 'Both "name" and "email" are required.');
    }
    if (String(password).length < 6) {
      return fail(res, 400, 'Password must be at least 6 characters long.');
    }

    const user = await dbStore.createUser({ name, email, password, role, avatar });
    return res.status(201).json({ success: true, message: 'User created successfully', data: user });
  } catch (error) {
    if (/already exists/i.test(error.message)) return fail(res, 409, error.message);
    return next(error);
  }
};

/* @route PUT /api/v2/users/:userId
 *
 * The one operation the leads panel never had. Name, email, role and avatar
 * are edited in place; `password` SETS a new one rather than revealing the old.
 *
 * There is no read side to a password and there cannot be. `scriper_users`
 * stores a bcrypt hash — `registerUser` and `updateUser` both `hashSync` on
 * the way in, `loginUser` checks with `compareSync`, and every read path
 * (`getUsers`, `findUserById`, this handler's own response) runs the record
 * through `withoutPassword` first. Nothing in the system is holding the
 * plaintext, so "show me their password" has no answer to give. What an admin
 * actually needs — putting an employee back in when they are locked out — is
 * this: set a known one and tell them to change it.
 */
const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) return fail(res, 400, 'User ID is required.');

    const { name, email, role, avatar, password } = req.body || {};

    /* An empty body would otherwise write nothing and report success, which
       reads as "saved" to whoever sent it. */
    if ([name, email, role, avatar, password].every((value) => value === undefined)) {
      return fail(res, 400, 'Nothing to update.');
    }

    if (password !== undefined && String(password).length < 6) {
      return fail(res, 400, 'Password must be at least 6 characters long.');
    }
    if (email !== undefined && !String(email).trim()) {
      return fail(res, 400, 'Email cannot be blank.');
    }
    if (name !== undefined && !String(name).trim()) {
      return fail(res, 400, 'Name cannot be blank.');
    }

    /* The same class of foot-gun the delete guard above is about. Demoting the
       account you are signed in as leaves a token that still claims ADMIN, so
       the panel keeps offering actions the server has already started
       refusing — and the mismatch lasts until the token is re-issued. */
    if (req.user && req.user.userId === userId && role !== undefined && role !== req.user.role) {
      return fail(res, 400, 'You cannot change the role of the account you are signed in with.');
    }

    const updated = await dbStore.updateUser(userId, { name, email, role, avatar, password });
    if (!updated) return fail(res, 404, 'User account not found.');

    return res.json({
      success: true,
      message: password ? 'User account updated, including a new password.' : 'User account updated.',
      data: updated,
    });
  } catch (error) {
    if (error.code === 11000 || /duplicate key/i.test(error.message || '')) {
      return fail(res, 409, 'That email is already in use by another account.');
    }
    return next(error);
  }
};

// @route DELETE /api/v2/users/:userId
const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) return fail(res, 400, 'User ID is required.');

    /* Deleting the account you are signed in as leaves a valid token pointing
       at nothing, and the next request logs you out with a confusing
       "account no longer exists". */
    if (req.user && req.user.userId === userId) {
      return fail(res, 400, 'You cannot delete the account you are signed in with.');
    }

    const deleted = await dbStore.deleteUser(userId);
    if (!deleted) return fail(res, 404, 'User account not found.');

    return res.json({ success: true, message: 'User account deleted successfully.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };

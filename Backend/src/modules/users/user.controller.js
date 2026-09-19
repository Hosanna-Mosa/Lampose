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

// @route POST /api/v2/users
const createUser = async (req, res, next) => {
  try {
    const {
      name, email, password: given, role = 'EMPLOYEE', avatar,
    } = req.body || {};

    if (!name || !email) {
      return fail(res, 400, 'Both "name" and "email" are required.');
    }

    /* Blank means "generate one", not "use the well-known one". See
       `newTemporaryPassword` above. */
    const generated = !String(given || '').trim();
    const password = generated ? newTemporaryPassword() : String(given);

    if (password.length < MIN_PASSWORD) {
      return fail(res, 400, `Password must be at least ${MIN_PASSWORD} characters long.`);
    }

    const user = await dbStore.createUser({ name, email, password, role, avatar });
    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      /* Returned once, and only when WE made it up. */
      data: generated ? { ...user, temporaryPassword: password } : user,
    });
  } catch (error) {
    if (/already exists/i.test(error.message)) return fail(res, 409, error.message);
    return next(error);
  }
};


/*
 * @route POST /api/v2/users/:userId/sign-out-everywhere   (ADMIN)
 * @route POST /api/v2/users/me/sign-out-everywhere        (anyone signed in)
 *
 * Ends every session an account has open, and nothing else.
 *
 * The leads panel had no way to do this. A token was good for its full seven
 * days and could not be withdrawn, so "this person has left" and "a token has
 * leaked" both had the same and only answer: delete the account — which also
 * deletes who onboarded what. This retires the sessions and leaves the account
 * and its history intact.
 *
 * `me` is separate from the `:userId` form on purpose. Ending YOUR OWN
 * sessions is not an administrative act — it is what somebody does from a
 * borrowed laptop — so it must not need the ADMIN role. Ending SOMEBODY
 * ELSE'S is, which is why the router guards the two differently.
 *
 * The caller's own token is retired too: there is no "except this one" here,
 * because the request that says "sign me out everywhere" is usually made from
 * the device you no longer trust.
 */
const signOutEverywhere = async (req, res, next) => {
  try {
    /*
     * Whose sessions, resolved from the VERIFIED TOKEN whenever this is the
     * `me` route — never from the path, or the non-ADMIN route would be a way
     * to revoke a colleague's sessions by typing their id into it.
     *
     * The absent case is the real one and not a defensive flourish:
     * `/users/me/sign-out-everywhere` declares no `:userId` segment at all, so
     * `req.params.userId` is `undefined` there rather than the string 'me'.
     * Reading only for 'me' passed `undefined` to the store, which found no
     * such user and answered 404 while the session stayed alive — a route that
     * reported failure would at least have been noticed; this one reported
     * nothing and did nothing.
     */
    const ownRoute = !req.params.userId || req.params.userId === 'me';
    const targetId = ownRoute ? req.user.userId : req.params.userId;

    const version = await dbStore.revokeSessions(targetId);
    if (version === null) return fail(res, 404, 'No such user.');

    return res.json({
      success: true,
      message: 'Every session for that account has been signed out.',
      data: { userId: targetId, sessionVersion: version },
    });
  } catch (error) {
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

    /* The same floor `createUser` uses. It was 6 here and 8 there, which
       makes the edit route the way round it — and setting a password is
       exactly what this route is for. */
    if (password !== undefined && String(password).length < MIN_PASSWORD) {
      return fail(res, 400, `Password must be at least ${MIN_PASSWORD} characters long.`);
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

module.exports = {
  getUsers, createUser, updateUser, deleteUser, signOutEverywhere,
};

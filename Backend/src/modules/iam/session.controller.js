/* ══════════════════════════════════════════════════════════════════════════
   Signing out, server-side, for the two stay-side app identities.

   The apps' tokens were stateless: "sign out" cleared the phone and nothing
   else, and a token copied off a handset kept working for seven days. Each
   account now carries `sessionVersion`, the token carries it as `ver`, and
   the guards compare the two on every request — so there is finally
   something to revoke.

     POST …/auth/logout   { pushToken?, everywhere? }

     pushToken    this handset's Expo token: forgotten, so the next person to
                  sign in on a shared phone does not see the last one's alerts.
     everywhere   bump `sessionVersion` and forget EVERY handset — every token
                  issued so far dies on its next request (SESSION_REVOKED),
                  and every registered device stops receiving pushes.

   One factory for both apps; the only difference is which guard set the
   account on the request.
   ══════════════════════════════════════════════════════════════════════════ */

const makeLogout = (accountKey) => async (req, res, next) => {
  try {
    const account = req[accountKey];
    if (!account) return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Please sign in to continue.' });

    const { pushToken, everywhere } = req.body || {};
    const update = {};
    if (everywhere === true) {
      update.$inc = { sessionVersion: 1 };
      update.$set = { devices: [] };
    } else if (pushToken) {
      update.$pull = { devices: { token: String(pushToken) } };
    }
    if (Object.keys(update).length) {
      await account.constructor.updateOne({ _id: account._id }, update);
    }
    return res.json({ success: true, data: { everywhere: everywhere === true } });
  } catch (error) {
    return next(error);
  }
};

module.exports = { makeLogout };

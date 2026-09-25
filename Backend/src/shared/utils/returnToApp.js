/**
 * The page a Razorpay checkout ends on: it hands the student back to the app.
 *
 * The User App opens the checkout in the phone's browser (Chrome Custom Tabs /
 * the iOS auth session) and waits for `lampose://…` to bring it back. A page
 * that jumps to that link by itself (a meta refresh or `window.location` with
 * no tap behind it) is exactly what Chrome refuses to follow silently: it
 * shows a "Continue to Lampose?" chip and the student is left staring at
 * "Returning to the app…". A link the student TAPS is a user gesture, and
 * Chrome opens the app from one without asking.
 *
 * So this page says plainly what happened, shows one big "Return to Lampose"
 * button, and still tries the automatic jump for browsers that allow it (iOS,
 * or Chrome when the payment itself was a recent tap).
 *
 * `appUrl` must already have been through the caller's `safeRedirect`, whose
 * charset admits nothing that can close an attribute, a string or a tag.
 */
const returnToAppPage = (appUrl, paid) => {
  const title = paid ? 'Payment successful' : 'Payment not completed';
  const body = paid
    ? 'Your payment is confirmed. Tap below to go back to the Lampose app.'
    : 'Nothing more will be charged. Tap below to go back to the Lampose app and try again.';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lampose</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;
margin:0;background:#f7f9f7;color:#14201a;text-align:center;padding:24px;box-sizing:border-box}
.card{max-width:340px;width:100%}
.mark{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;margin:0 auto 16px;
font-size:28px;color:#fff;background:${paid ? '#1f7a4d' : '#9a6b12'}}
h1{font-size:1.25rem;margin:0 0 8px}
p{color:#46564d;margin:0 0 24px;line-height:1.45}
a.btn{display:block;padding:16px;border-radius:12px;background:#14532d;color:#fff;
text-decoration:none;font-weight:600;font-size:1rem}
</style></head>
<body><div class="card">
<div class="mark">${paid ? '&#10003;' : '!'}</div>
<h1>${title}</h1>
<p>${body}</p>
<a class="btn" href="${appUrl}">Return to Lampose</a>
</div>
<script>setTimeout(function () { window.location.href = ${JSON.stringify(appUrl)}; }, 300);</script>
</body></html>`;
};

module.exports = { returnToAppPage };

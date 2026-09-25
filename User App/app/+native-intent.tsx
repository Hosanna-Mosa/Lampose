/**
 * Deep links the router should NOT turn into a screen.
 *
 * `lampose://payment-done` (and the server's default `food-payment-done`) is
 * where the Razorpay checkout page sends the browser when it is finished. It
 * exists to close the browser and hand control back to `app/pay/checkout.tsx`,
 * which is waiting on `WebBrowser.openAuthSessionAsync` and decides where to
 * go next. Routing it as well would push a "not found" screen on top.
 *
 * Returning nothing while the app is running makes the router ignore the link.
 * On a cold start (the app was killed while the student was in the browser)
 * there is no checkout screen waiting, so they land on Home, where the
 * booking or order reads its payment state from the server.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (/^(lampose:\/\/)?\/?(food-)?payment-done(\?|$|\/)/.test(path)) {
      return initial ? '/' : null;
    }
    return path;
  } catch {
    return path;
  }
}

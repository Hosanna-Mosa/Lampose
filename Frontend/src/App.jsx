import {
  BrowserRouter, Navigate, Route, Routes, useLocation,
} from 'react-router-dom';
import { Shell } from './components/common/templates/Shell/Shell';
import { AuthProvider } from './auth/AuthProvider';
import { CartProvider } from './food/CartProvider';

/* Routes whose first section sits on a light ground need the solid navbar
   immediately — the transparent bar is only legible over the forest hero. */

/* Nested routes count too: /explore/:id opens on the same light ground as
   /explore, and an exact-match check left the bar transparent over it. */

/* The onboarding form runs its own step rail and keeps an action bar pinned to
   the bottom of the window. The marketing footer under that bar is both
   unreachable and a way out of a half-finished application, so this one route
   drops it — the navbar stays, because the flow is still part of the site. */

/* The site was a set of .html files before this rebuild, so existing links and
   bookmarks still carry that extension. Map them onto the real routes instead
   of dumping every one of them on the catch-all. */


export function App() {
  return (
    <BrowserRouter>
      {/* Inside the router, because the navbar reads both and a provider above
          it would still work — but every future screen that wants the session
          also wants the route, and keeping them in one order means there is
          only one answer to "which wraps which". */}
      <AuthProvider>
        {/* The cart is read by the navbar as well as by the food pages, so it
            wraps the whole shell rather than a route — a pill that can only
            count what the current page knows about is a pill that empties
            itself on navigation. */}
        <CartProvider>
          <Shell />
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

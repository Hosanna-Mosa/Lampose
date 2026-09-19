import React from 'react';
import { useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useReveals } from '../../../../hooks/useSite';
import { Splash } from '../../organisms/Splash/Splash';
import { Cursor } from '../../atoms/Cursor/Cursor';
import { Navbar } from '../../organisms/Navbar/Navbar';
import { SignInDialog } from '../../organisms/SignInDialog';
import { useAuth } from '../../../../auth/AuthProvider';
import { Footer } from '../../organisms/Footer/Footer';
import { isLightTop, LEGACY, isChromeless } from '../../utils/chromeRules';
import { Home } from '../../../../pages/Home';
import { Explore } from '../../../../pages/Explore';
import { Listing } from '../../../../pages/Listing';
import { Partners } from '../../../../pages/Partners';
import { FoodPartner } from '../../../../pages/FoodPartner';
import { FoodOrder } from '../../../../pages/FoodOrder';
import { FoodKitchen } from '../../../../pages/FoodKitchen';
import { FoodCart } from '../../../../pages/FoodCart';
import { FoodCheckout } from '../../../../pages/FoodCheckout';
import { FoodOrders } from '../../../../pages/FoodOrders';
import { FoodTrack } from '../../../../pages/FoodTrack';
import { FoodPartnerOnboarding } from '../../../../pages/FoodPartnerOnboarding';
import { Contact } from '../../../../pages/Contact';
import { Privacy } from '../../../../pages/Privacy';
import { Terms } from '../../../../pages/Terms';
import { ChildSafety } from '../../../../pages/ChildSafety';
import { DeleteAccount } from '../../../../pages/DeleteAccount';
import { Main } from '../../atoms';

export function Shell() {
  const { pathname, hash } = useLocation();

  /* One sign-in panel for the whole site, rendered here rather than by
     whichever control asked for it. The bar opens it; so does signing out of
     a visit request, which has to land somewhere. Two copies driven by two
     pieces of state is how two of them end up on screen at once. */
  const { signInOpen, closeSignIn } = useAuth();

  /*
   * Client-side navigation keeps the old scroll offset, which drops you into
   * the middle of the next page. So every route change starts at the top —
   * unless the link named a section.
   *
   * The hash matters now that Services and How It Works are sections of the
   * home page rather than routes of their own. The footer and the old
   * `/services.html` bookmarks point at `/#services`, and without this they
   * would land on Home scrolled to the top: the right page, and not the thing
   * that was clicked.
   *
   * Falls back to the top when the hash names nothing on the page, which is
   * what a stale link deserves — better than leaving the visitor wherever the
   * previous page happened to be scrolled to.
   */
  useEffect(() => {
    const target = hash ? document.querySelector(hash) : null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  // Re-observe on every route: each page mounts its own .reveal elements.
  useReveals([pathname]);

  return (
    <>
      <Splash />
      <Cursor />
      <Navbar alwaysSolid={isLightTop(pathname)} />

      {signInOpen && <SignInDialog onClose={closeSignIn} />}

      <Main id="top">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/explore/:id" element={<Listing />} />
          <Route path="/partners" element={<Partners />} />

          {/* Ordering food, for the diner. Six routes, one flow: the feed,
              a kitchen's menu, the cart, the payment step, the history and
              one order while it is happening.

              `/food/dish/:dishId` is the kitchen page with that dish's sheet
              already open — a shared dish link has to land somewhere a person
              can order from, and a dish away from its kitchen's timings and
              minimum is not that place.

              These sit above `/food-partner` in the file only for reading
              order; the router matches on the full path, and `/food-partner`
              is not a child of `/food`. */}
          <Route path="/food" element={<FoodOrder />} />
          <Route path="/food/kitchen/:id" element={<FoodKitchen />} />
          <Route path="/food/dish/:dishId" element={<FoodKitchen />} />
          <Route path="/food/cart" element={<FoodCart />} />
          <Route path="/food/checkout" element={<FoodCheckout />} />
          <Route path="/food/orders" element={<FoodOrders />} />
          <Route path="/food/orders/:reference" element={<FoodTrack />} />
          <Route path="/food-partner" element={<FoodPartner />} />
          <Route path="/food-partner/onboarding" element={<FoodPartnerOnboarding />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/child-safety" element={<ChildSafety />} />
          {/* Public and unguarded, and it has to be: Google Play requires that
              a rider be able to reach account-deletion information and ask for
              deletion from the open web, without the app and without signing
              in. Nothing on this route reads a session. */}
          <Route path="/delete-account" element={<DeleteAccount />} />
          {Object.entries(LEGACY).map(([from, to]) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}
          <Route path="*" element={<Home />} />
        </Routes>
      </Main>

      {!isChromeless(pathname) && <Footer />}
    </>
  );
}

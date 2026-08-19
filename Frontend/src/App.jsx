import { useEffect } from 'react';
import {
  BrowserRouter, Navigate, Route, Routes, useLocation,
} from 'react-router-dom';
import { Cursor, Footer, Navbar, Splash } from './components/Chrome';
import { useReveals } from './hooks/useSite';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Listing from './pages/Listing';
import Services from './pages/Services';
import How from './pages/How';
import Cities from './pages/Cities';
import Partners from './pages/Partners';
import Food from './pages/Food';
import FoodPartner from './pages/FoodPartner';
import FoodPartnerOnboarding from './pages/FoodPartnerOnboarding';
import Download from './pages/Download';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import ChildSafety from './pages/ChildSafety';

/* Routes whose first section sits on a light ground need the solid navbar
   immediately — the transparent bar is only legible over the forest hero. */
const LIGHT_TOP = ['/', '/explore', '/services', '/how', '/cities', '/partners', '/food', '/food-partner', '/download', '/contact', '/privacy', '/terms', '/child-safety'];

/* Nested routes count too: /explore/:id opens on the same light ground as
   /explore, and an exact-match check left the bar transparent over it. */
const isLightTop = p => LIGHT_TOP.some(r => p === r || p.startsWith(`${r}/`));

/* The onboarding form runs its own step rail and keeps an action bar pinned to
   the bottom of the window. The marketing footer under that bar is both
   unreachable and a way out of a half-finished application, so this one route
   drops it — the navbar stays, because the flow is still part of the site. */
const isChromeless = p => p.startsWith('/food-partner/onboarding');

/* The site was a set of .html files before this rebuild, so existing links and
   bookmarks still carry that extension. Map them onto the real routes instead
   of dumping every one of them on the catch-all. */
const LEGACY = {
  '/index.html': '/',
  '/explore.html': '/explore',
  '/services.html': '/services',
  '/how.html': '/how',
  '/cities.html': '/cities',
  '/partners.html': '/partners',
  '/food.html': '/food',
  '/download.html': '/download',
  '/contact.html': '/contact',
  '/privacy.html': '/privacy',
  '/terms.html': '/terms',
};

function Shell() {
  const { pathname } = useLocation();

  // Client-side navigation keeps the old scroll offset, which drops you into
  // the middle of the next page.
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  // Re-observe on every route: each page mounts its own .reveal elements.
  useReveals([pathname]);

  return (
    <>
      <Splash />
      <Cursor />
      <Navbar alwaysSolid={isLightTop(pathname)} />

      <main id="top">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/explore/:id" element={<Listing />} />
          <Route path="/services" element={<Services />} />
          <Route path="/how" element={<How />} />
          <Route path="/cities" element={<Cities />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/food" element={<Food />} />
          <Route path="/food-partner" element={<FoodPartner />} />
          <Route path="/food-partner/onboarding" element={<FoodPartnerOnboarding />} />
          <Route path="/download" element={<Download />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/child-safety" element={<ChildSafety />} />
          {Object.entries(LEGACY).map(([from, to]) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}
          <Route path="*" element={<Home />} />
        </Routes>
      </main>

      {!isChromeless(pathname) && <Footer />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

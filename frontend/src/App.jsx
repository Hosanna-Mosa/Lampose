import { useEffect } from 'react';
import {
  BrowserRouter, Navigate, Route, Routes, useLocation,
} from 'react-router-dom';
import { Cursor, Footer, Navbar, Splash } from './components/Chrome';
import { useReveals } from './hooks/useSite';
import Home from './pages/Home';
import Services from './pages/Services';
import How from './pages/How';
import Cities from './pages/Cities';
import Partners from './pages/Partners';
import Food from './pages/Food';
import Download from './pages/Download';
import Contact from './pages/Contact';

/* Routes whose first section sits on a light ground need the solid navbar
   immediately — the transparent bar is only legible over the forest hero. */
const LIGHT_TOP = ['/services', '/how', '/cities', '/partners', '/food', '/download', '/contact'];

/* The site was a set of .html files before this rebuild, so existing links and
   bookmarks still carry that extension. Map them onto the real routes instead
   of dumping every one of them on the catch-all. */
const LEGACY = {
  '/index.html': '/',
  '/services.html': '/services',
  '/how.html': '/how',
  '/cities.html': '/cities',
  '/partners.html': '/partners',
  '/food.html': '/food',
  '/download.html': '/download',
  '/contact.html': '/contact',
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
      <Navbar alwaysSolid={LIGHT_TOP.includes(pathname)} />

      <main id="top">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/how" element={<How />} />
          <Route path="/cities" element={<Cities />} />
          <Route path="/partners" element={<Partners />} />
          <Route path="/food" element={<Food />} />
          <Route path="/download" element={<Download />} />
          <Route path="/contact" element={<Contact />} />
          {Object.entries(LEGACY).map(([from, to]) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}
          <Route path="*" element={<Home />} />
        </Routes>
      </main>

      <Footer />
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

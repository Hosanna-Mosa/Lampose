import React from 'react';
import { useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useReveals } from '../../../../hooks/useSite';
import { Splash } from '../../organisms/Splash/Splash';
import { Cursor } from '../../atoms/Cursor/Cursor';
import { Navbar } from '../../organisms/Navbar/Navbar';
import { Footer } from '../../organisms/Footer/Footer';
import { isLightTop, LEGACY, isChromeless } from '../../utils/chromeRules';
import { Home } from '../../../../pages/Home';
import { Explore } from '../../../../pages/Explore';
import { Listing } from '../../../../pages/Listing';
import { Services } from '../../../../pages/Services';
import { How } from '../../../../pages/How';
import { Cities } from '../../../../pages/Cities';
import { Partners } from '../../../../pages/Partners';
import { Food } from '../../../../pages/Food';
import { FoodPartner } from '../../../../pages/FoodPartner';
import { FoodPartnerOnboarding } from '../../../../pages/FoodPartnerOnboarding';
import { Download } from '../../../../pages/Download';
import { Contact } from '../../../../pages/Contact';
import { Privacy } from '../../../../pages/Privacy';
import { Terms } from '../../../../pages/Terms';
import { ChildSafety } from '../../../../pages/ChildSafety';
import { Main } from '../../atoms';

export function Shell() {
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

      <Main id="top">
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
      </Main>

      {!isChromeless(pathname) && <Footer />}
    </>
  );
}

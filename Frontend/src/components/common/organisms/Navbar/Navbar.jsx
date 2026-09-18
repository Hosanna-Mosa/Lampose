import React from 'react';
import { useScrollChrome, useMagnetic } from '../../../../hooks/useSite';
import { useState, useEffect } from 'react';
import { useLocation, NavLink, Link } from 'react-router-dom';
import { NAV_LINKS } from '../../../../data/site';
import logoImg from '../../../../assets/logo.png';
import { useAuth } from '../../../../auth/AuthProvider';
import { Box, Image, Inline, List, ListItem, Navigation, PlainButton } from '../../atoms';

/* ══ Navbar ═══════════════════════════════════════════════════════════════
   Transparent while the page under it is the forest hero, cream once past
   60px. Pages that open on a light ground start in the scrolled state so the
   links are never cream-on-cream.
   ════════════════════════════════════════════════════════════════════════ */

export function Navbar({ alwaysSolid }) {
  const { bar, scrolled } = useScrollChrome();
  const [menu, setMenu] = useState(false);
  const cta = useMagnetic();
  const { pathname } = useLocation();

  /*
   * Who is here, and the panel that asks.
   *
   * `hydrating` draws NOTHING rather than "Sign in": the stored session is
   * read synchronously but confirmed with the server a moment later, and a
   * bar that says "Sign in" for one frame and then somebody's name is a
   * flicker that reads as having been signed out.
   */
  const { status, user, signOut, openSignIn } = useAuth();

  /* First name only. The bar is narrow, and an owner sees the full name on a
     request either way. */
  const shortName = (user?.name || '').trim().split(/\s+/)[0] || 'Account';

  // Any route change closes the sheet — otherwise it stays open over the
  // new page after a link inside it is followed.
  useEffect(() => { setMenu(false); }, [pathname]);

  const solid = alwaysSolid || scrolled;

  return (
    <>
      <Box id="sp" ref={bar} aria-hidden="true" />

      <Box id="mobMenu" className={`mob-menu${menu ? ' open' : ''}`} aria-hidden={!menu}>
        {NAV_LINKS.map(l => (
          <NavLink key={l.to} to={l.to} onClick={() => setMenu(false)}>{l.label}</NavLink>
        ))}
        {/* The bar's account control is hidden at this width, so the sheet
            carries it — otherwise signing in is unreachable on a phone, which
            is most of this site's traffic. */}
        {status === 'signedIn' ? (
          <PlainButton
            className="mob-menu__signin"
            onClick={() => { setMenu(false); signOut(); }}
          >
            Sign out ({shortName})
          </PlainButton>
        ) : status === 'guest' ? (
          <PlainButton
            className="mob-menu__signin"
            onClick={() => { setMenu(false); openSignIn(); }}
          >
            Sign in
          </PlainButton>
        ) : null}

        {/* Was "Get Started" → /download. That page is gone and the apps are
            not linked from the site yet, so the bar's one action is the one
            the hero already leads with: find a room. */}
        <Link
          to="/explore" className="btn-nav-solid mob-menu__cta"
          onClick={() => setMenu(false)}
        >
          Explore Stays
        </Link>
      </Box>

      <Navigation id="navbar" className={solid ? 'scrolled' : ''}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <Image src={logoImg} alt="Lampose" className="nav-logo-img" />
          </Link>
        </Box>

        <List className="nav-links">
          {NAV_LINKS.map(l => (
            <ListItem key={l.to}>
              <NavLink
                to={l.to}
                className={({ isActive }) => (isActive ? 'nav-active' : undefined)}
                end={l.to === '/'}
              >
                {l.label}
              </NavLink>
            </ListItem>
          ))}
        </List>

        <Box className="nav-actions">
          {status === 'signedIn' ? (
            <PlainButton className="nav-account" onClick={signOut} title={user?.phone || ''}>
              <Inline className="nav-account__name">{shortName}</Inline>
              <Inline className="nav-account__out">Sign out</Inline>
            </PlainButton>
          ) : status === 'guest' ? (
            <PlainButton className="nav-signin" onClick={openSignIn}>
              Sign in
            </PlainButton>
          ) : null}

          <Link to="/explore" className="btn-nav-solid" ref={cta}>Explore Stays</Link>
          <PlainButton
            className="hamburger" onClick={() => setMenu(v => !v)}
            aria-label="Menu" aria-expanded={menu}
          >
            <Inline /><Inline /><Inline />
          </PlainButton>
        </Box>
      </Navigation>
    </>
  );
}

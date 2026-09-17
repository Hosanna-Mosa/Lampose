import React from 'react';
import { useScrollChrome, useMagnetic } from '../../../../hooks/useSite';
import { useState, useEffect } from 'react';
import { useLocation, NavLink, Link } from 'react-router-dom';
import { NAV_LINKS } from '../../../../data/site';
import logoImg from '../../../../assets/logo.png';
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
        <Link
          to="/download" className="btn-nav-solid mob-menu__cta"
          onClick={() => setMenu(false)}
        >
          Get Started
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
          <Link to="/download" className="btn-nav-solid" ref={cta}>Download App</Link>
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

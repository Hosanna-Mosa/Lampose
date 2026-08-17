import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useCursor, useMagnetic, useScrollChrome } from '../hooks/useSite';
import { FOOTER_COLS, FOOTER_DESC, NAV_LINKS, SOCIALS } from '../data/site';
import logoImg from '../assets/logo.png';

/* ══ Splash ═══════════════════════════════════════════════════════════════
   Only ever shown on the first load of the session. Re-playing it on every
   client-side route change would be a full-screen interruption between pages.

   The flag must be set when the splash *finishes*, never when the effect
   starts. StrictMode runs effects mount → cleanup → mount in development;
   flagging on entry meant the cleanup cleared the timers and the second run
   bailed out before rescheduling them, leaving the splash up permanently.
   ════════════════════════════════════════════════════════════════════════ */
let splashDone = false;

export function Splash() {
  const [zooming, setZooming] = useState(false);
  const [gone, setGone] = useState(splashDone);

  useEffect(() => {
    if (splashDone) return undefined;
    // Step 1: Calmly display logo first, then smoothly initiate the single "O" zoom
    const a = setTimeout(() => {
      setZooming(true);
    }, 1400);

    // Step 2: Smooth, graceful 2.6s cinematic zoom before unmount
    const b = setTimeout(() => {
      splashDone = true;
      setGone(true);
    }, 4000);

    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  if (gone) return null;

  return (
    <div id="splash" className={zooming ? 'sp-zooming' : ''} aria-hidden="true">
      <div className="sp-content">
        <div className="sp-logo-wrapper">
          <img src={logoImg} alt="Lampose" className="sp-logo-img" />
          <div className="sp-single-o" />
        </div>
        <div className="sp-meta">
          <div className="sp-bar"><div className="sp-fill" /></div>
          <div className="sp-tag">Stay · Eat · Deliver</div>
        </div>
      </div>
    </div>
  );
}

/* ══ Cursor ═══════════════════════════════════════════════════════════════ */
export function Cursor() {
  const { dot, ring } = useCursor();
  return (
    <>
      <div id="cursor" ref={dot} aria-hidden="true" />
      <div id="cursor-ring" ref={ring} aria-hidden="true" />
    </>
  );
}

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
      <div id="sp" ref={bar} aria-hidden="true" />

      <div id="mobMenu" className={`mob-menu${menu ? ' open' : ''}`} aria-hidden={!menu}>
        {NAV_LINKS.map(l => (
          <NavLink key={l.to} to={l.to} onClick={() => setMenu(false)}>{l.label}</NavLink>
        ))}
        <Link
          to="/download" className="btn-nav-solid mob-menu__cta"
          onClick={() => setMenu(false)}
        >
          Get Started
        </Link>
      </div>

      <nav id="navbar" className={solid ? 'scrolled' : ''}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            <img src={logoImg} alt="Lampose" className="nav-logo-img" />
          </Link>
        </div>

        <ul className="nav-links">
          {NAV_LINKS.map(l => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                className={({ isActive }) => (isActive ? 'nav-active' : undefined)}
                end={l.to === '/'}
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="nav-actions">
          <Link to="/download" className="btn-nav-solid" ref={cta}>Download App</Link>
          <button
            className="hamburger" onClick={() => setMenu(v => !v)}
            aria-label="Menu" aria-expanded={menu}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>
    </>
  );
}

/* ══ Footer ═══════════════════════════════════════════════════════════════ */
export const Footer = () => (
  <footer>
    <div className="footer-grid">
      <div className="f-brand">
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
          <img src={logoImg} alt="Lampose" className="footer-logo-img" />
        </Link>
        <div className="footer-hq">📍 Founded in Visakhapatnam · Serving India</div>
        <p className="footer-desc">{FOOTER_DESC}</p>
        <div className="socials">
          {SOCIALS.map(s => (
            <a className="social" href="#top" key={s} aria-label="Social link">{s}</a>
          ))}
        </div>
      </div>

      {FOOTER_COLS.map(col => (
        <div className="footer-col" key={col.title}>
          <h4>{col.title}</h4>
          <ul>
            {col.links.map(l => (
              <li key={l.label}>
                {l.to
                  ? <Link to={l.to}>{l.label}</Link>
                  : <a href={l.href || '#top'}>{l.label}</a>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    <div className="footer-bottom">
      <span>© 2025 Lampose Technologies Pvt. Ltd. All rights reserved.</span>
    </div>
  </footer>
);

/* ══ Section heading ══════════════════════════════════════════════════════
   The tag / heading / sub trio repeats on every page, so it lives here once.
   ════════════════════════════════════════════════════════════════════════ */
export const SecHead = ({ tag, title, em, sub, align = 'center', mb = '2.5rem' }) => (
  <div className="reveal" style={{ textAlign: align, marginBottom: mb }}>
    <span className="sec-tag">{tag}</span>
    <h2 className="sec-h2">{title} {em && <em>{em}</em>}</h2>
    {sub && (
      <p className="sec-sub" style={{ margin: align === 'center' ? '0.75rem auto' : '0.75rem 0' }}>
        {sub}
      </p>
    )}
  </div>
);

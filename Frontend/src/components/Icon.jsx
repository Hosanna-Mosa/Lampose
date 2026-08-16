/* ══════════════════════════════════════════════════════════════════════════
   Icon set.

   Stroked outlines rather than emoji: an emoji is a font glyph that renders
   differently on every platform and cannot be animated or recoloured. Every
   shape carries pathLength="1" so one dash rule can draw any of them, and they
   inherit their colour from the card they sit in.

   All drawn on a 24×24 grid, ~1.7 stroke, round caps and joins.
   ══════════════════════════════════════════════════════════════════════════ */

const PATHS = {
  /* ── Section icons ─────────────────────────────────────────────────── */
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2.2" pathLength="1" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="2.2" pathLength="1" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="2.2" pathLength="1" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="2.2" pathLength="1" />
    </>
  ),
  steps: (
    <>
      <circle cx="5" cy="18.5" r="2.4" pathLength="1" />
      <circle cx="12" cy="12" r="2.4" pathLength="1" />
      <circle cx="19" cy="5.5" r="2.4" pathLength="1" />
      <path d="M6.8 16.8 L10.2 13.7" pathLength="1" />
      <path d="M13.8 10.3 L17.2 7.2" pathLength="1" />
    </>
  ),
  map: (
    <>
      <path d="M3 6.4 L9 4 L15 6.8 L21 4.4 V17.6 L15 20 L9 17.2 L3 19.6 Z" pathLength="1" />
      <path d="M9 4 V17.2" pathLength="1" />
      <path d="M15 6.8 V20" pathLength="1" />
    </>
  ),
  stay: (
    <>
      <path d="M3 18 V9" pathLength="1" />
      <path d="M3 12.5 H21 V18" pathLength="1" />
      <path d="M3 18 H21" pathLength="1" />
      <path d="M7 12.5 V10 h4 v2.5" pathLength="1" />
    </>
  ),
  food: (
    <>
      <path d="M4 15.5 a8 8 0 0 1 16 0" pathLength="1" />
      <path d="M2.5 15.5 H21.5" pathLength="1" />
      <path d="M12 7.5 V5.5" pathLength="1" />
      <path d="M6 19 H18" pathLength="1" />
    </>
  ),
  delivery: (
    <>
      <path d="M13.5 6.5 H19 l2 4.5 v4.5 h-7.5 Z" pathLength="1" />
      <circle cx="16" cy="18" r="2.2" pathLength="1" />
      <circle cx="7" cy="18" r="2.2" pathLength="1" />
      <path d="M11.3 18 H9.2" pathLength="1" />
      <path d="M2.5 9 H8" pathLength="1" />
      <path d="M1.5 12.5 H6" pathLength="1" />
    </>
  ),

  /* ── Feature icons ─────────────────────────────────────────────────── */
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" pathLength="1" />
      <path d="M15.4 15.4 L20.5 20.5" pathLength="1" />
      <path d="M8 10.5 H13" pathLength="1" />
    </>
  ),
  verified: (
    <>
      <path d="M12 3 L20 6.2 v5.3c0 4.6-3.3 8.4-8 9.5-4.7-1.1-8-4.9-8-9.5V6.2Z" pathLength="1" />
      <path d="M8.6 11.9 L11 14.3 L15.6 9.6" pathLength="1" />
    </>
  ),
  track: (
    <>
      <circle cx="12" cy="12" r="7.5" pathLength="1" />
      <circle cx="12" cy="12" r="2.4" pathLength="1" />
      <path d="M12 1.8 V4.4" pathLength="1" />
      <path d="M12 19.6 V22.2" pathLength="1" />
      <path d="M1.8 12 H4.4" pathLength="1" />
      <path d="M19.6 12 H22.2" pathLength="1" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.6 5.6 1.6 5.6H4.9S6.5 14 6.5 10Z" pathLength="1" />
      <path d="M10.2 18.6a2 2 0 0 0 3.6 0" pathLength="1" />
    </>
  ),
  tag: (
    <>
      <path d="M11.4 3.2 20.8 12.6 12.6 20.8 3.2 11.4V3.2Z" pathLength="1" />
      <circle cx="7.6" cy="7.6" r="1.6" pathLength="1" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 20.5 H20.5" pathLength="1" />
      <path d="M6.8 20.5 V13" pathLength="1" />
      <path d="M12 20.5 V6.5" pathLength="1" />
      <path d="M17.2 20.5 V10" pathLength="1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" pathLength="1" />
      <path d="M3 19.5c0-3.1 2.7-5.3 6-5.3s6 2.2 6 5.3" pathLength="1" />
      <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6" pathLength="1" />
      <path d="M18 14.6c1.9.7 3 2.4 3 4.4" pathLength="1" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" pathLength="1" />
      <path d="M3 10.5 H21" pathLength="1" />
      <circle cx="16.8" cy="14.8" r="1.4" pathLength="1" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10.5v3a1.8 1.8 0 0 0 1.8 1.8H8l7 4.2V4.5L8 8.7H5.8A1.8 1.8 0 0 0 4 10.5Z" pathLength="1" />
      <path d="M18.4 9.2a4 4 0 0 1 0 5.6" pathLength="1" />
    </>
  ),
  reach: (
    <>
      <circle cx="12" cy="12" r="2.4" pathLength="1" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4" pathLength="1" />
      <path d="M16.2 16.2a6 6 0 0 0 0-8.4" pathLength="1" />
      <path d="M5 5a10 10 0 0 0 0 14" pathLength="1" />
      <path d="M19 19a10 10 0 0 0 0-14" pathLength="1" />
    </>
  ),
  orders: (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="3" pathLength="1" />
      <path d="M9 3.5V6h6V3.5" pathLength="1" />
      <path d="M8.6 12 L10.6 14 L15.4 9.4" pathLength="1" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" pathLength="1" />
      <path d="M3.5 9.6 H20.5" pathLength="1" />
      <path d="M8 3v4" pathLength="1" />
      <path d="M16 3v4" pathLength="1" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3" pathLength="1" />
      <path d="M2.5 10 H21.5" pathLength="1" />
      <path d="M6 14.6 H10" pathLength="1" />
    </>
  ),
  rupee: (
    <>
      <circle cx="12" cy="12" r="8.8" pathLength="1" />
      <path d="M9.2 7.8h5.6" pathLength="1" />
      <path d="M9.2 10.6h5.6" pathLength="1" />
      <path d="M13.2 7.8c1.6 0 2.6 1.2 2.6 2.6s-1 2.6-2.6 2.6H9.6l5 4.2" pathLength="1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.8" pathLength="1" />
      <path d="M12 6.8V12l3.6 2.2" pathLength="1" />
    </>
  ),
  trophy: (
    <>
      <path d="M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0Z" pathLength="1" />
      <path d="M7.5 5.6H4.6a3 3 0 0 0 2.9 4.4" pathLength="1" />
      <path d="M16.5 5.6h2.9a3 3 0 0 1-2.9 4.4" pathLength="1" />
      <path d="M12 13.7V17" pathLength="1" />
      <path d="M8.4 20.4h7.2" pathLength="1" />
    </>
  ),
  route: (
    <>
      <circle cx="5.5" cy="6" r="2.4" pathLength="1" />
      <circle cx="18.5" cy="18" r="2.4" pathLength="1" />
      <path d="M5.5 8.4v4.1a3.5 3.5 0 0 0 3.5 3.5h6.6" pathLength="1" />
      <path d="M13.6 13.6 16.4 16 13.6 18.4" pathLength="1" />
    </>
  ),
  filters: (
    <>
      <path d="M4 7h16" pathLength="1" />
      <path d="M4 12h16" pathLength="1" />
      <path d="M4 17h16" pathLength="1" />
      <circle cx="9" cy="7" r="2" pathLength="1" />
      <circle cx="15" cy="12" r="2" pathLength="1" />
      <circle cx="8" cy="17" r="2" pathLength="1" />
    </>
  ),
  wave: (
    <>
      <path d="M2.5 9.5c2.4-2.6 4.8-2.6 7.2 0s4.8 2.6 7.2 0 4.8-2.6 4.6-.2" pathLength="1" />
      <path d="M2.5 14.5c2.4-2.6 4.8-2.6 7.2 0s4.8 2.6 7.2 0 4.8-2.6 4.6-.2" pathLength="1" />
      <path d="M2.5 19.5c2.4-2.6 4.8-2.6 7.2 0s4.8 2.6 7.2 0 4.8-2.6 4.6-.2" pathLength="1" />
    </>
  ),
  temple: (
    <>
      <path d="M12 2.5 4.5 8h15Z" pathLength="1" />
      <path d="M6 8v11" pathLength="1" />
      <path d="M18 8v11" pathLength="1" />
      <path d="M12 11v8" pathLength="1" />
      <path d="M3 21h18" pathLength="1" />
    </>
  ),
  pillars: (
    <>
      <path d="M3 8.5 12 3.5l9 5" pathLength="1" />
      <path d="M6 11v7" pathLength="1" />
      <path d="M12 11v7" pathLength="1" />
      <path d="M18 11v7" pathLength="1" />
      <path d="M3.5 20.5h17" pathLength="1" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4c0 8.5-5 12.5-11 12.5-2 0-4-.6-4-.6C5 9 10.5 4.5 20 4Z" pathLength="1" />
      <path d="M4 20c2-5 5.5-8 11-10" pathLength="1" />
    </>
  ),
  hill: (
    <>
      <circle cx="17.5" cy="6.5" r="2.6" pathLength="1" />
      <path d="M2.5 18.5 8 10l5 7" pathLength="1" />
      <path d="M11 18.5 15 13l6.5 5.5" pathLength="1" />
      <path d="M1.5 20.5h21" pathLength="1" />
    </>
  ),
  boat: (
    <>
      <path d="M12 3.5 6.5 14h5.5Z" pathLength="1" />
      <path d="M13.5 7 18 14h-4.5" pathLength="1" />
      <path d="M3 17.5h18l-2.5 4h-13Z" pathLength="1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21.5s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" pathLength="1" />
      <circle cx="12" cy="10.2" r="2.6" pathLength="1" />
    </>
  ),
  qr: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" pathLength="1" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" pathLength="1" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" pathLength="1" />
      <path d="M14 14h2.5v2.5" pathLength="1" />
      <path d="M20.5 20.5H18V18" pathLength="1" />
    </>
  ),
};

export default function Icon({ name, className = 'svc-ico' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name] || PATHS.grid}
    </svg>
  );
}

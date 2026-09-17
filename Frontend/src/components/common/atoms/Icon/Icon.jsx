import { PATHS } from '../../utils/iconPaths';
/* ══════════════════════════════════════════════════════════════════════════
   Icon set.

   Stroked outlines rather than emoji: an emoji is a font glyph that renders
   differently on every platform and cannot be animated or recoloured. Every
   shape carries pathLength="1" so one dash rule can draw any of them, and they
   inherit their colour from the card they sit in.

   All drawn on a 24×24 grid, ~1.7 stroke, round caps and joins.
   ══════════════════════════════════════════════════════════════════════════ */


export function Icon({ name, className = 'svc-ico' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name] || PATHS.grid}
    </svg>
  );
}

import React, { useEffect, useState } from 'react';
import { Box, Inline } from '../../../common/atoms';

/* ══ Photo tile ═══════════════════════════════════════════════════════════
   Where a photograph goes, and what stands there until one exists.

   Roughly half of what onboarding collects from kitchens this size arrives
   without a usable picture, so a missing photo is the ordinary case rather
   than the error case - every layout here is built to be correct without
   one. The tile carries a tint drawn from the kitchen or dish (`tone`) and a
   bowl glyph, so a grid of them still reads as a grid of different places
   rather than as six identical grey boxes.

   `label` prints the word "Photo" in the corner: the tile is honest about
   being a placeholder rather than pretending to be an image that failed.

   ## The real photo, when the database has one

   `src` is the photo the kitchen or the dish uploaded. When it is there, it
   fills the tile and the placeholder steps aside; when it is missing, EMPTY,
   or fails to load, the tile is exactly what it always was. So a page never
   shows a broken-image icon: the fallback is not a special case, it is the
   default the photo is drawn over.

   The photos are Cloudinary URLs at whatever size the owner uploaded - often
   a phone camera's full resolution, for a card that is 300 pixels wide. They
   are asked for at a sensible size and format instead (`w_640,f_auto,q_auto`),
   which is a fraction of the bytes for a picture nobody can tell apart.
   ════════════════════════════════════════════════════════════════════════ */

/**
 * Ask Cloudinary for a smaller copy of an image it hosts.
 *
 * Only touches a Cloudinary delivery URL that has no transformation yet, so a
 * URL from anywhere else - or one already transformed - is returned as it was.
 * `c_limit` scales DOWN to the width and never up, so a small original is not
 * blown up into a blur.
 */
const sized = (url, width) => {
  const marker = '/image/upload/';
  const at = url.indexOf(marker);
  if (at < 0 || !/res\.cloudinary\.com/.test(url)) return url;
  const rest = url.slice(at + marker.length);
  /* A transformation segment looks like `w_640,f_auto` - letters, an
     underscore, no version number. A version is `v` and digits. */
  if (!/^v\d+\//.test(rest)) return url;
  return url.slice(0, at + marker.length) + `c_limit,w_${width},f_auto,q_auto/` + rest;
};

export function PhotoTile({
  tone = 'stone', className = '', label = null, children = null, src = '', alt = '', width = 640,
}) {
  const [failed, setFailed] = useState(false);
  /* A new photo gets a fresh chance: `failed` belongs to one URL, and a tile
     reused for a different dish must not stay blank because the last one 404ed. */
  useEffect(() => { setFailed(false); }, [src]);

  const showPhoto = Boolean(src) && !failed;

  return (
    <Box className={`fd-tile fd-tile--${tone} ${className}`.trim()}>
      {showPhoto ? (
        <img
          src={sized(src, width)}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
          }}
        />
      ) : (
        <svg className="fd-tile__glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11h18a9 9 0 0 1-18 0Z" />
          <path d="M9 7c0-1 1-1.4 1-2.5M13 7c0-1 1-1.4 1-2.5M17 7c0-1 1-1.4 1-2.5" />
        </svg>
      )}
      {/* The word "Photo" labels a PLACEHOLDER. Over a real photograph it would
          be a caption on a picture that is not missing. */}
      {!showPhoto && label && <Inline className="fd-tile__label">{label}</Inline>}
      {children}
    </Box>
  );
}

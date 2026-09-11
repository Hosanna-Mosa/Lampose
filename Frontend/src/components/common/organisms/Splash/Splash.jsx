import { useEffect, useState } from 'react';
import logoImg from '../../../../assets/logo.png';
import { Box, Image } from '../../atoms';

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
    <Box id="splash" className={zooming ? 'sp-zooming' : ''} aria-hidden="true">
      <Box className="sp-content">
        <Box className="sp-logo-wrapper">
          <Image src={logoImg} alt="Lampose" className="sp-logo-img" />
          <Box className="sp-single-o" />
        </Box>
        <Box className="sp-meta">
          <Box className="sp-bar"><Box className="sp-fill" /></Box>
          <Box className="sp-tag">Stay · Eat · Deliver</Box>
        </Box>
      </Box>
    </Box>
  );
}

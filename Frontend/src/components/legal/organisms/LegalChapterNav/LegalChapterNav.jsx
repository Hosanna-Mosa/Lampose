import React from 'react';
import { Box, Navigation, PlainButton } from '../../../common/atoms';

/* The sticky row of chapter pills carried by all three legal documents.

   Two differences between the copies are REAL rendered output, not noise, so
   they are props rather than something to average away:

     · Child Safety wraps the pills in <nav aria-label="…">; Privacy and Terms
       use a plain <div>. A landmark with a label is better, but changing the
       other two would change their markup, and nothing in this refactor is
       allowed to do that. `navLabel` selects it.
     · Child Safety's buttons carry type="button"; the others do not.
       `buttonType` selects it.

   Both props are also emitted in the same ORDER the originals used, because
   attribute order is part of the serialised HTML the gate compares and
   nothing normalises it away. */
export const LegalChapterNav = ({ chapters, activeId, onSelect, navLabel, buttonType }) => {
  const Track = navLabel ? Navigation : Box;
  const trackProps = navLabel
    ? { className: 'privacy-nav-track', 'aria-label': navLabel }
    : { className: 'privacy-nav-track' };

  return (
    <Box className="privacy-nav-sticky">
      <Box className="sec-inner">
        <Track {...trackProps}>
          {chapters.map((ch) => (
            <PlainButton
              key={ch.id}
              {...(buttonType ? { type: buttonType } : {})}
              className={`privacy-nav-pill ${activeId === ch.id ? 'active' : ''}`}
              onClick={() => onSelect(ch.id)}
            >
              {ch.label}
            </PlainButton>
          ))}
        </Track>
      </Box>
    </Box>
  );
};

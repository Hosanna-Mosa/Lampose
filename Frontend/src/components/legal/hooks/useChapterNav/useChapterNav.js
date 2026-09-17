import { useState } from 'react';

/* Which chapter pill is lit, and the smooth scroll that lights it.

   Privacy, Terms and Child Safety each carried a byte-identical copy of this:
   the same `ch-1` default, the same -120px offset to clear the sticky header,
   the same smooth scroll. Three copies of a magic number is how two of them
   end up disagreeing with the third after someone adjusts the header height.

   The offset stays a constant here rather than a parameter, because the thing
   it compensates for — the height of the sticky nav — is the same on all
   three pages. A parameter would invite them to drift apart again. */
const HEADER_OFFSET = -120;

export function useChapterNav(initialId = 'ch-1') {
  const [activeChapter, setActiveChapter] = useState(initialId);

  const scrollToChapter = (id) => {
    setActiveChapter(id);
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.pageYOffset + HEADER_OFFSET;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return { activeChapter, scrollToChapter };
}

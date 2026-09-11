import React from 'react';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Box, Heading, PlainButton } from '../../../common/atoms';

export function Modal({ title, onClose, children, wide }) {
  /* Callers pass a fresh arrow every render, so the handler is read through a
     ref — binding the effect to `onClose` would tear the listener down and
     put the page's scroll back on every keystroke inside the sheet. */
  const close = useRef(onClose);
  close.current = onClose;

  /* Escape closes, and the body cannot scroll behind an open sheet — the
     step under this one is long enough that it otherwise scrolls away. */
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <Box className="ob-scrim" onClick={onClose} role="presentation">
      <Box
        className={`ob-modal${wide ? ' ob-modal--wide' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
      >
        <Box className="ob-modal__head">
          <Heading level={3}>{title}</Heading>
          <PlainButton type="button" className="ob-x" onClick={onClose} aria-label="Close">
            <Icon name="close" className="ob-ico" />
          </PlainButton>
        </Box>
        {children}
      </Box>
    </Box>
  );
}

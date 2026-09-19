import { useEffect } from 'react';
import { Box, Heading, Inline, PlainButton, Text } from '../../../common/atoms';

/* ══ Start a new cart? ════════════════════════════════════════════════════
   A cart holds one kitchen's food, because an order is a ticket printed at
   one counter and a rider collects from one door.

   So adding from somewhere else has to ask. It names BOTH kitchens — the one
   being emptied and the one being started — because "your cart will be
   cleared" without saying whose food is in it is a sentence people confirm
   and then regret.
   ════════════════════════════════════════════════════════════════════════ */

export function SwitchKitchenSheet({ holding, joining, onCancel, onConfirm }) {
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <Box className="fd-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <Box className="fd-ask" role="dialog" aria-modal="true" aria-labelledby="switch-title">
        <Heading level={2} id="switch-title" className="fd-ask__title">Start a new cart?</Heading>
        <Text className="fd-ask__body">
          Your cart has food from <Inline className="fd-strong">{holding.name}</Inline>. One order goes to one
          kitchen, so adding from <Inline className="fd-strong">{joining.name}</Inline> empties it first.
        </Text>
        <Box className="fd-ask__actions">
          <PlainButton type="button" className="fd-btn fd-btn--ghost" onClick={onCancel}>
            Keep {holding.name}
          </PlainButton>
          <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={onConfirm}>
            Start a new cart
          </PlainButton>
        </Box>
      </Box>
    </Box>
  );
}

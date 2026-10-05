import React, { useState } from 'react';
import { Box, Inline, PlainButton, Text } from '../../../common/atoms';
import { rupees } from '../../../../data/food';

/* ══ Bill ═════════════════════════════════════════════════════════════════
   One component so the cart, the checkout summary and the receipt cannot
   disagree about what a line is called or whether a fee is included.

   The lines on every screen: Item total, Delivery fee, then one "GST & other
   charges" row (opens to show each GST, the service, packaging and small
   order fees) — then Total and the coupon when there is one, then To pay.
   The figures come from the server's `foodPricing.js` (or the browser's copy
   of it, `food/pricing.js`, until the quote lands). A row worth nothing is
   dropped rather than printed as zero.
   ════════════════════════════════════════════════════════════════════════ */

const Row = ({ label, value }) => (
  <Box className="fd-bill__row">
    <Inline>{label}</Inline>
    <Inline className="fd-bill__val">{value}</Inline>
  </Box>
);

/**
 * The fee rows alone — shared with the order tracking page. Delivery stays in
 * front; every GST line and the small fees fold into one "GST & other
 * charges" row that opens on click, the way the big delivery apps print it.
 */
export function FeeRows({ bill, fulfilment = 'delivery', distanceLabel = null }) {
  const [open, setOpen] = useState(false);
  const {
    gst, gstRate, deliveryFee, deliveryGst, serviceFee, serviceFeeGst,
    packagingCharge, packagingGst, smallOrderFee,
  } = bill;
  const parts = [
    [`GST on food${gstRate ? ` (${gstRate}%)` : ''}`, gst],
    ['GST on delivery (18%)', deliveryGst],
    ['Service fee', serviceFee],
    ['GST on service fee (18%)', serviceFeeGst],
    ['Packaging fee', packagingCharge],
    ['GST on packaging (18%)', packagingGst],
    ['Small order fee', smallOrderFee],
  ].filter(([, value]) => value > 0);
  const charges = Math.round(parts.reduce((sum, [, value]) => sum + Number(value), 0) * 100) / 100;

  return (
    <>
      {fulfilment === 'delivery' && (
        <Row label={`Delivery fee${distanceLabel ? ` | ${distanceLabel}` : ''}`} value={deliveryFee ? rupees(deliveryFee) : 'Free'} />
      )}
      {parts.length > 0 && (
        <PlainButton
          type="button"
          className="fd-bill__row"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', width: '100%', textAlign: 'left', font: 'inherit' }}
        >
          <Inline style={{ textDecoration: 'underline dashed', textUnderlineOffset: 4 }}>
            GST &amp; other charges {open ? '▴' : '▾'}
          </Inline>
          <Inline className="fd-bill__val">{rupees(charges)}</Inline>
        </PlainButton>
      )}
      {open && parts.map(([label, value]) => (
        <Box key={label} className="fd-bill__row" style={{ paddingLeft: '0.9rem', fontSize: '0.8rem' }}>
          <Inline>{label}</Inline>
          <Inline>{rupees(value)}</Inline>
        </Box>
      ))}
    </>
  );
}

export function BillLines({ bill, fulfilment = 'delivery', couponCode, distanceLabel = null, payLabel = 'To pay' }) {
  const { itemTotal, discount, toPay, grossTotal, smallOrderFee, smallOrderThreshold, distanceKm } = bill;
  const distance = distanceLabel || (Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : null);

  return (
    <Box className="fd-bill">
      <Row label="Item total" value={rupees(itemTotal)} />
      <FeeRows bill={bill} fulfilment={fulfilment} distanceLabel={distance} />

      {discount > 0 && (
        <>
          <Row label="Total" value={rupees(grossTotal)} />
          <Box className="fd-bill__row fd-bill__row--save">
            <Inline>Discount{couponCode ? ` · ${couponCode}` : ''}</Inline>
            <Inline className="fd-bill__val">− {rupees(discount)}</Inline>
          </Box>
        </>
      )}

      <Box className="fd-rule" />

      <Box className="fd-bill__total">
        <Inline>{payLabel}</Inline>
        <Inline className="fd-bill__big">{rupees(toPay)}</Inline>
      </Box>

      <Text className="fd-note">
        {bill.priced === 'preview'
          ? 'Delivery is priced by distance once your address is confirmed. '
          : ''}
        {smallOrderFee > 0 && smallOrderThreshold > itemTotal
          ? `Add ${rupees(smallOrderThreshold - itemTotal)} more to skip the small order fee.`
          : 'The order is priced again by Lampose when you place it.'}
      </Text>
    </Box>
  );
}

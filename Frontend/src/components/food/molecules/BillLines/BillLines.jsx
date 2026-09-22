import React from 'react';
import { Box, Inline, Text } from '../../../common/atoms';
import { rupees } from '../../../../data/food';

/* ══ Bill ═════════════════════════════════════════════════════════════════
   Items, GST, the platform fee, delivery, the coupon, the total — in that
   order, on every screen that shows money. One component so the cart, the
   checkout summary and the receipt cannot disagree about what a line is
   called or whether a fee is included.

   ## What changed, and what it means for old orders

   The kitchen's packing charge is no longer billed; GST at 5% and a flat ₹2
   platform fee took its place. `foodCharges.util.js` on the server decides
   both and stores what each order was actually charged, which is why the
   packing row is still HERE: an order placed before the change carries a real
   figure in it, and a receipt that silently dropped the row would not add up.
   It prints for those orders and for no new one.

   The tax row is the same story in reverse. There used to be a note saying no
   tax is added; there is now, it is named with its rate, and the note is gone
   rather than left contradicting the line above it.

   A row worth nothing is dropped rather than printed as zero — except the
   delivery fee, which prints "Free" because a fee that is absent and a fee
   that is waived are different pieces of news.
   ════════════════════════════════════════════════════════════════════════ */

export function BillLines({ bill, fulfilment = 'delivery', couponCode, distanceLabel = null, payLabel = 'To pay' }) {
  const {
    itemTotal, packagingCharge, gst, gstRate, platformFee, deliveryFee, discount, toPay,
  } = bill;

  return (
    <Box className="fd-bill">
      <Box className="fd-bill__row">
        <Inline>Item total</Inline>
        <Inline className="fd-bill__val">{rupees(itemTotal)}</Inline>
      </Box>

      {/* Only on an order that was charged one, before the change. */}
      {packagingCharge > 0 && (
        <Box className="fd-bill__row">
          <Inline>Packing charge</Inline>
          <Inline className="fd-bill__val">{rupees(packagingCharge)}</Inline>
        </Box>
      )}

      {gst > 0 && (
        <Box className="fd-bill__row">
          <Inline>GST{gstRate ? ` (${gstRate}%)` : ''}</Inline>
          <Inline className="fd-bill__val">{rupees(gst)}</Inline>
        </Box>
      )}

      {platformFee > 0 && (
        <Box className="fd-bill__row">
          <Inline>Platform fee</Inline>
          <Inline className="fd-bill__val">{rupees(platformFee)}</Inline>
        </Box>
      )}

      {fulfilment === 'delivery' && (
        <Box className="fd-bill__row">
          <Inline>Delivery fee{distanceLabel ? ` · ${distanceLabel}` : ''}</Inline>
          <Inline className="fd-bill__val">{deliveryFee ? rupees(deliveryFee) : 'Free'}</Inline>
        </Box>
      )}

      {discount > 0 && (
        <Box className="fd-bill__row fd-bill__row--save">
          <Inline>Coupon {couponCode}</Inline>
          <Inline className="fd-bill__val">− {rupees(discount)}</Inline>
        </Box>
      )}

      <Box className="fd-rule" />

      <Box className="fd-bill__total">
        <Inline>{payLabel}</Inline>
        <Inline className="fd-bill__big">{rupees(toPay)}</Inline>
      </Box>

      <Text className="fd-note">
        GST is charged on the food at {gstRate || 5}%. The platform fee is ₹{platformFee || 2} an order,
        whether it is delivered or collected.
      </Text>
    </Box>
  );
}

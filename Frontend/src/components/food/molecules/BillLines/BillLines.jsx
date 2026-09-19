import React from 'react';
import { Box, Inline, Text } from '../../../common/atoms';
import { rupees } from '../../../../data/food';

/* ══ Bill ═════════════════════════════════════════════════════════════════
   Items, packing, delivery, the coupon, the total — in that order, on every
   screen that shows money. One component so the cart, the checkout summary
   and the receipt cannot disagree about what a line is called or whether a
   fee is included.

   No tax row: there is no tax on a Lampose food order, and a row reading
   "Taxes ₹0" invents a levy to reassure people about.

   A row worth nothing is dropped rather than printed as zero — except the
   delivery fee, which prints "Free" because a fee that is absent and a fee
   that is waived are different pieces of news.
   ════════════════════════════════════════════════════════════════════════ */

export function BillLines({ bill, fulfilment = 'delivery', couponCode, distanceLabel = null, payLabel = 'To pay' }) {
  const { itemTotal, packagingCharge, deliveryFee, discount, toPay } = bill;

  return (
    <Box className="fd-bill">
      <Box className="fd-bill__row">
        <Inline>Item total</Inline>
        <Inline className="fd-bill__val">{rupees(itemTotal)}</Inline>
      </Box>

      {packagingCharge > 0 && (
        <Box className="fd-bill__row">
          <Inline>Packing charge</Inline>
          <Inline className="fd-bill__val">{rupees(packagingCharge)}</Inline>
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
        No tax is added to a Lampose food order. Items, packing and delivery are the whole bill.
      </Text>
    </Box>
  );
}

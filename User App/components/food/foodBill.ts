import type { BillLine } from './BillBreakdown';

/**
 * The bill lines of a food order, the way every screen prints them:
 *
 *   Item total
 *   Delivery fee | 3.5 km
 *   GST & other charges        ← one line, tap to open:
 *     GST (5%) · Delivery GST · Service fee · Service fee GST ·
 *     Packaging fee · Packaging GST · Small order fee
 *   (Total and Discount, when there is a discount)
 *
 * The main prices stay in front and the taxes and small fees fold into one
 * line, opened on tap. Cart, payment and the receipt all build from here, so
 * a line cannot be named one thing before paying and another after. There is
 * no "platform fee" and never a commission: those are not the diner's.
 */
export type FoodBillInput = {
  itemCount?: number;
  itemTotal: number;
  foodGst: number;
  /** Percent, e.g. 5. */
  foodGstRate: number;
  /** GST already inside the menu prices — printed as included, not added. */
  foodGstIncluded?: boolean;
  deliveryFee: number;
  deliveryGst: number;
  deliveryLabel?: string;
  serviceFee: number;
  serviceFeeGst: number;
  packagingFee: number;
  packagingGst: number;
  smallOrderFee: number;
  discount?: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function foodBillLines(b: FoodBillInput): BillLine[] {
  const items = b.itemCount
    ? `Item total · ${b.itemCount} ${b.itemCount === 1 ? 'item' : 'items'}`
    : 'Item total';
  const lines: BillLine[] = [
    { id: 'items', label: items, amount: b.itemTotal },
    { id: 'delivery', label: b.deliveryLabel || 'Delivery fee', amount: b.deliveryFee },
  ];

  const GROUP = 'charges';
  const parts: BillLine[] = [];
  if (b.foodGst) {
    parts.push(b.foodGstIncluded
      ? { id: 'gst', label: `GST on food (${b.foodGstRate}%, in prices)`, amount: b.foodGst, amountLabel: 'Included', group: GROUP }
      : { id: 'gst', label: `GST on food (${b.foodGstRate}%)`, amount: b.foodGst, group: GROUP });
  }
  if (b.deliveryGst) parts.push({ id: 'delivery-gst', label: 'GST on delivery (18%)', amount: b.deliveryGst, group: GROUP });
  if (b.serviceFee) parts.push({ id: 'service', label: 'Service fee', amount: b.serviceFee, group: GROUP });
  if (b.serviceFeeGst) parts.push({ id: 'service-gst', label: 'GST on service fee (18%)', amount: b.serviceFeeGst, group: GROUP });
  if (b.packagingFee) parts.push({ id: 'packaging', label: 'Packaging fee', amount: b.packagingFee, group: GROUP });
  if (b.packagingGst) parts.push({ id: 'packaging-gst', label: 'GST on packaging (18%)', amount: b.packagingGst, group: GROUP });
  if (b.smallOrderFee) parts.push({ id: 'small-order', label: 'Small order fee', amount: b.smallOrderFee, group: GROUP });

  const charges = round2(parts.reduce((sum, line) => (line.amountLabel ? sum : sum + line.amount), 0));
  if (parts.length) {
    lines.push({ id: GROUP, label: 'GST & other charges', amount: charges, expandable: true }, ...parts);
  }

  if (b.discount) {
    lines.push({ id: 'gross', label: 'Total', amount: round2(b.itemTotal + b.deliveryFee + charges) });
    lines.push({ id: 'discount', label: 'Discount', amount: b.discount, discount: true });
  }
  return lines;
}

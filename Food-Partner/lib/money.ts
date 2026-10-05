/* Money, and the one sentence a partner reads back to check their own pricing. */
import type { OnboardingData } from "@/store/partnerStore";

/** "+ Extra cheese, Raita" — the add-ons on one order line, or '' for none. */
export const addOnsLabel = (addOns?: { name?: string }[] | null): string => {
  const names = (addOns ?? []).map((a) => (a?.name ?? "").trim()).filter(Boolean);
  return names.length ? `+ ${names.join(", ")}` : "";
};

export const rupees = (value: string | number | undefined | null): string => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN")}`;
};

/**
 * The delivery rule, restated in plain English.
 *
 * The three fee types are easy to configure and easy to get backwards, and
 * nothing on the form otherwise shows the partner what a diner would actually
 * be charged. This is that sentence.
 */
export const deliverySentence = (d: Pick<
  OnboardingData,
  "deliveryFeeType" | "deliveryFeeAmount" | "deliveryFeePerKm" | "deliveryFreeAboveValue" | "minOrderValue" | "packagingCharge"
>): string => {
  /* One true sentence, whatever the form holds. This used to read back the
     kitchen's own fee ("Delivery is ₹30 on every order") — but that fee prices
     nothing any more: Lampose charges the diner by distance (`foodPricing.js`
     on the server), so the sentence described a charge no diner ever paid.
     The parameter stays so the three screens that show it need no change. */
  void d;
  return "Delivery is priced by Lampose by distance and charged to the diner — you do not set a delivery fee.";
};

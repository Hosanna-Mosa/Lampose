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
  const parts: string[] = [];

  if (d.deliveryFeeType === "flat") {
    parts.push(d.deliveryFeeAmount ? `Delivery is ${rupees(d.deliveryFeeAmount)} on every order.` : "Delivery fee not set yet.");
  } else if (d.deliveryFeeType === "distance_based") {
    parts.push(
      d.deliveryFeePerKm
        ? `Delivery is ${d.deliveryFeeAmount ? `${rupees(d.deliveryFeeAmount)} plus ` : ""}${rupees(d.deliveryFeePerKm)} per kilometre from your restaurant.`
        : "Per-kilometre rate not set yet.",
    );
  } else {
    parts.push(
      d.deliveryFreeAboveValue
        ? `Delivery is free above ${rupees(d.deliveryFreeAboveValue)}${
            d.deliveryFeeAmount ? `, and ${rupees(d.deliveryFeeAmount)} below it` : ""
          }.`
        : "Free-above threshold not set yet.",
    );
  }


  return parts.join(" ");
};

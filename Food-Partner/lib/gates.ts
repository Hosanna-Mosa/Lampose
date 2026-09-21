/* ══════════════════════════════════════════════════════════════════════════
   What a step is still waiting on, named the way the partner would name it.

   Ported from the website's `missingFor`, and its comment is the reason this
   file exists at all: a disabled Next with nothing to explain it is the single
   most annoying thing a long form can do, so the GATE and the EXPLANATION are
   the same list. The step opens when this comes back empty, and while it is
   not empty the screen prints it.

   Every entry is a lower-case fragment naming the missing thing, so
   `humanList` can join them into a sentence that reads.
   ══════════════════════════════════════════════════════════════════════════ */
import type { PartnerCopy } from "@/constants/partner";
import type { OnboardingData } from "@/store/partnerStore";

export const missingFor = (step: number, d: OnboardingData, copy: PartnerCopy): string[] => {
  const need: string[] = [];

  if (step === 1) {
    if (!d.restaurantName.trim()) need.push(copy.businessLabel.toLowerCase());
    if (!d.cuisineTypes.length) need.push("a cuisine");
    if (!d.ownerName.trim()) need.push("the owner's name");
    if (!d.ownerEmail.includes("@")) need.push("an email address");
    if (d.password.length < 6) need.push("a password of at least 6 characters");
    else if (d.password !== d.confirmPassword) need.push("both passwords to match");
    if (!d.otpVerified) need.push("the phone number verified");
    if (!d.addressLine1.trim()) need.push("the shop or building");
    if (!d.city.trim()) need.push("the city");
    if (!d.state.trim()) need.push("the state");
    if (d.pincode.length !== 6) need.push("a 6-digit pincode");
    if (!d.landmark.trim()) need.push("a nearby landmark");
  }

  if (step === 2) {
    if (!d.days.length) need.push("the days you are open");
    else if (!d.days.every((day) => (d.slots[day] || []).some((s) => s.open && s.close))) {
      need.push("opening hours for every day selected");
    }
    if (!d.avgPreparationTime) need.push("a preparation time");
    if (!d.deliveryRadiusKm) need.push("a delivery radius");

    /* Only the field the chosen fee type actually uses. Asking for all three
       would block a partner on numbers their own pricing never involves. */
    if (d.deliveryFeeType === "flat" && !d.deliveryFeeAmount) need.push("the delivery fee");
    if (d.deliveryFeeType === "distance_based" && !d.deliveryFeePerKm) need.push("the per-kilometre rate");
    if (d.deliveryFeeType === "free_above" && !d.deliveryFreeAboveValue) {
      need.push("the order value above which delivery is free");
    }

    // A restaurant that takes neither cash nor card cannot be paid at all.
    if (!d.acceptsOnlinePayment && !d.acceptsCod) need.push("at least one way to be paid");
  }

  if (step === 3) {
    if (d.menuMode === "upload") {
      if (!d.menuFile || !d.menuValid || !d.menuRows.length) need.push("a readable menu sheet");
      else if (!d.menuRows.every((row) => row.image)) need.push("a photo for every item in the sheet");
    } else {
      const items = d.menuCategories.flatMap((c) => c.items);
      if (!items.length) need.push("at least one menu item");
      else if (!items.every((i) => i.productName.trim() && i.price && i.category)) {
        need.push("a name, a price and a category on every item");
      }
    }
  }

  if (step === 4) {
    if (d.pan.length < 10) need.push("the PAN number");
    if (!d.panFile) need.push("a copy of the PAN card");
    if (!d.gstExempt && d.gstin.length !== 15) need.push("the GSTIN");
    if (!d.gstExempt && !d.gstFile) need.push("the GST certificate");
    if (d.fssai.length !== 14) need.push("a 14-digit FSSAI number");
    if (!d.fssaiExpiry) need.push("the FSSAI expiry date");
    if (!d.fssaiFile) need.push("a copy of the FSSAI licence");
    if (!d.accountHolderName.trim()) need.push("the account holder's name");
    if (d.account.length < 9) need.push("the bank account number");
    else if (d.account !== d.accountConfirm) need.push("both account numbers to match");
    if (d.ifsc.length !== 11) need.push("an 11-character IFSC");
    else if (!d.ifscVerified) need.push("the IFSC code confirmed");
    if (!d.chequeFile) need.push("a cancelled cheque");
  }

  if (step === 5) {
    if (!d.accepted) need.push("the terms accepted");
    if (d.signature.trim().length < 2) need.push("your signature");
  }

  return need;
};

/** "a, b and c", cut short before it turns into a paragraph. */
export const humanList = (items: string[]): string => {
  if (!items.length) return "";
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  const joined =
    shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0];
  return rest > 0 ? `${joined}, and ${rest} more` : joined;
};

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

/* Shape checks, upper-cased first — the fields capitalise as typed but a
   pasted value may not be. Length alone let "ABCDEFGHIJ" through as a PAN
   and anything with an "@" through as an email, to be refused at review. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const up = (v: string) => v.trim().toUpperCase();

export const missingFor = (step: number, d: OnboardingData, copy: PartnerCopy): string[] => {
  const need: string[] = [];

  if (step === 1) {
    if (!d.restaurantName.trim()) need.push(copy.businessLabel.toLowerCase());
    if (!d.cuisineTypes.length) need.push("a cuisine");
    if (!d.ownerName.trim()) need.push("the owner's name");
    if (!EMAIL_RE.test(d.ownerEmail.trim())) need.push("a valid email address");
    if (d.password.length < 6) need.push("a password of at least 6 characters");
    else if (d.password !== d.confirmPassword) need.push("both passwords to match");
    if (!d.otpVerified) need.push("the phone number verified");
    if (!d.addressLine1.trim()) need.push("the shop or building");
    if (!d.city.trim()) need.push("the city");
    if (!d.state.trim()) need.push("the state");
    if (d.pincode.length !== 6) need.push("a 6-digit pincode");
    if (!d.landmark.trim()) need.push("a nearby landmark");
    /* Required, not optional: dispatch finds riders from this pin, and a
       kitchen without one never gets a single delivery. */
    if (!(Number(d.lat) || Number(d.lng))) need.push("the map pin for your restaurant");
  }

  if (step === 2) {
    if (!d.days.length) need.push("the days you are open");
    else if (!d.days.every((day) => (d.slots[day] || []).some((s) => s.open && s.close))) {
      need.push("opening hours for every day selected");
    }
    if (!d.avgPreparationTime) need.push("a preparation time");
    if (!d.deliveryRadiusKm) need.push("a delivery radius");

    /* No delivery-fee checks: the kitchen no longer sets one. Lampose prices
       delivery by distance (`foodPricing.js`), and the stored fee prices
       nothing — see `deliverySentence`. */

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
    if (!PAN_RE.test(up(d.pan))) need.push("a valid PAN number (like ABCDE1234F)");
    if (!d.panFile) need.push("a copy of the PAN card");
    if (!d.gstExempt && !GSTIN_RE.test(up(d.gstin))) need.push("a valid 15-character GSTIN");
    if (!d.gstExempt && !d.gstFile) need.push("the GST certificate");
    if (d.fssai.length !== 14) need.push("a 14-digit FSSAI number");
    if (!d.fssaiExpiry) need.push("the FSSAI expiry date");
    /* Refused HERE rather than by the server at the very end — after every
       photograph has been uploaded — which is where an expired licence used
       to be caught. Compared as YYYY-MM-DD strings, which order correctly. */
    else if (d.fssaiExpiry < new Date().toISOString().slice(0, 10)) {
      need.push("an FSSAI licence that has not expired");
    }
    if (!d.fssaiFile) need.push("a copy of the FSSAI licence");
    if (!d.accountHolderName.trim()) need.push("the account holder's name");
    if (d.account.length < 9) need.push("the bank account number");
    else if (d.account !== d.accountConfirm) need.push("both account numbers to match");
    if (!IFSC_RE.test(up(d.ifsc))) need.push("a valid IFSC (4 letters, 0, then 6 letters or digits)");
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

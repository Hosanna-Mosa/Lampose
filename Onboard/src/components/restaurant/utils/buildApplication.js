/*
 * The wizard's state, turned into the body `POST /api/v2/food-partners/applications`
 * reads — and the gates that decide when each step may be left.
 *
 * Both live here, together, because they are two halves of one agreement with
 * the backend: `validateApplication` on the server refuses an application the
 * gates below should never have let through, and when the two disagree the
 * agent meets a 400 at the END of a twenty-minute form. Keeping them in one
 * file is what makes a drift between them visible.
 *
 * The payload keys are deliberately the ones the backend's `sanitiseApplication`
 * already names — `selectedDays` and `dayTimeSlots` as siblings, `shopNo` and
 * `floor` as address parts, `sameAsOwner` as a flag rather than a resolved
 * number. None of that is a coincidence: that reader was written against this
 * form, so the form sends what it reads rather than a shape it has to guess at.
 */

import { CONTRACT_COMMISSION, CONTRACT_PLATFORM_FEE } from './restaurantOptions';

const trim = (value) => String(value ?? '').trim();

/* ── The step gates ───────────────────────────────────────────────────────── */

/*
 * The owner's mobile is checked for SHAPE, not for possession.
 *
 * There is no one-time code: the agent is standing with the owner and reads
 * the number off their phone. Ten digits is still enforced, because the
 * backend refuses anything that is not an Indian mobile — that number is what
 * a rider rings from outside the shutter.
 */
export const canProceedStep1 = (form) => (
  trim(form.restaurantName).length > 0
  && form.cuisines.length > 0
  && trim(form.ownerName).length > 0
  && trim(form.ownerEmail).includes('@')
  && form.ownerPhone.replace(/\D/g, '').length === 10
  && trim(form.area).length > 0
  && trim(form.city).length > 0
  && trim(form.landmark).length > 0
);

/*
 * Hours, and nothing else.
 *
 * There is no menu to gate on: the restaurant adds it from the Food-Partner
 * app after approval. The backend agrees — the rule demanding at least one
 * item was removed from `validateApplication` for the same reason, so this
 * gate and that validator still say the same thing.
 */
export const canProceedStep2 = (form) => (
  form.selectedDays.length > 0
  && form.selectedDays.every((day) => (form.dayTimeSlots[day] || [])
    .some((slot) => slot.open && slot.close))
);

/*
 * Two scans, both mandatory: the PAN card and the FSSAI certificate.
 *
 * The GST certificate and the cancelled cheque are no longer asked for as
 * IMAGES — their numbers still are, and are still validated, but an agent in
 * a kitchen is not going to be handed a bank statement, and a form that will
 * not move on until they are is a form abandoned on the doorstep.
 *
 * The bank block stays all-or-nothing rather than optional-per-field: the
 * backend refuses a half-filled payout ("an account number with no IFSC is
 * money that cannot be sent"), so the gate mirrors that rule rather than
 * letting the agent discover it at submit.
 */
export const canProceedStep3 = (form) => (
  trim(form.panNumber).length === 10
  && form.panFile !== null
  && (form.gstExempt || trim(form.gstin).length === 15)
  && trim(form.fssaiNumber).length === 14
  && trim(form.fssaiExpiry).length > 0
  && form.fssaiFile !== null
  && trim(form.accountHolderName).length > 0
  && form.bankAccount.length >= 9
  && form.bankAccount === form.bankConfirm
  && trim(form.ifsc).length === 11
  && form.ifscFetched
);

export const canSubmit = (form) => (
  form.acceptedTos && trim(form.signature).length > 0
);

export const canProceed = (form, step) => {
  if (step === 1) return canProceedStep1(form);
  if (step === 2) return canProceedStep2(form);
  if (step === 3) return canProceedStep3(form);
  return canSubmit(form);
};

/* ── The payload ──────────────────────────────────────────────────────────── */

/**
 * Everything the submit call needs, in one object.
 *
 * Returns `{ restaurant, products, files, … }` rather than the raw body
 * because the uploads have to happen between building this and posting it:
 * `files` is what gets pushed to Cloudinary, and `restaurant` is spread into
 * the body afterwards with the resulting document rows attached.
 */
export const buildApplicationPayload = (form) => {
  /* Only the days that are ticked. A slot map still holding Sunday's hours
     from before it was unticked would reopen the restaurant on Sunday. */
  const dayTimeSlots = {};
  form.selectedDays.forEach((day) => {
    dayTimeSlots[day] = form.dayTimeSlots[day] || [];
  });

  const restaurant = {
    /* Fixed, not chosen. `food_restaurants` carries a `partnerType` that other
       clients read, so the application states it rather than relying on the
       schema default — but Lampose onboards restaurants only, so there is no
       longer anything on the form that could set it to something else. */
    partnerType: 'food',

    restaurantName: trim(form.restaurantName),
    cuisines: form.cuisines,

    ownerName: trim(form.ownerName),
    ownerEmail: trim(form.ownerEmail).toLowerCase(),
    ownerPhone: trim(form.ownerPhone),

    /* Sent as the flag plus the box, not as a resolved number. The backend
       honours `sameAsOwner` itself, so a ticked box with an empty field means
       the owner's number there exactly as it does here. */
    sameAsOwner: form.sameAsOwner,
    primaryContact: form.sameAsOwner ? trim(form.ownerPhone) : trim(form.primaryContact),

    location: {
      lat: form.gpsLat ? Number(form.gpsLat) : undefined,
      lng: form.gpsLng ? Number(form.gpsLng) : undefined,
    },

    address: {
      shopNo: trim(form.shopNo),
      floor: trim(form.floor),
      area: trim(form.area),
      city: trim(form.city),
      landmark: trim(form.landmark),
    },

    selectedDays: form.selectedDays,
    dayTimeSlots,

    panNumber: trim(form.panNumber).toUpperCase(),
    gstin: trim(form.gstin).toUpperCase(),
    gstExempt: form.gstExempt,

    fssaiNumber: trim(form.fssaiNumber),
    fssaiExpiry: trim(form.fssaiExpiry),

    bank: {
      accountHolderName: trim(form.accountHolderName),
      accountNumber: trim(form.bankAccount),
      accountType: form.accountType,
      ifsc: trim(form.ifsc).toUpperCase(),
    },

    contract: {
      accepted: form.acceptedTos,
      signature: trim(form.signature),
      commission: CONTRACT_COMMISSION,
      platformFee: CONTRACT_PLATFORM_FEE,
    },
  };

  return {
    restaurant,
    /* Always empty. Kept on the payload rather than dropped so the submit
       call's upload loop has a list to iterate and does not need a branch for
       the one shape it will ever see. */
    products: [],

    /* Read by the submit call, which uploads each one and turns it into a
       `verificationDocuments` row carrying the number beside the scan. */
    files: {
      pan: form.panFile,
      fssai: form.fssaiFile,
    },
    panNumber: trim(form.panNumber).toUpperCase(),
    gstin: trim(form.gstin).toUpperCase(),
    gstExempt: form.gstExempt,
    fssaiNumber: trim(form.fssaiNumber),
    fssaiExpiry: trim(form.fssaiExpiry),
  };
};

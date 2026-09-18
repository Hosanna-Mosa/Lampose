/*
 * The wizard's state, turned into the body `POST /api/v2/food-partners/applications`
 * reads.
 *
 * The step gates used to live here too, beside it, because they are two halves
 * of one agreement with the backend: `validateApplication` on the server
 * refuses an application the gates should never have let through, and when the
 * two disagree the agent meets a 400 at the END of a twenty-minute form. They
 * now live in `validateRestaurant.js` — same agreement, same reasoning written
 * out there, but a message per field rather than one boolean per step, because
 * a greyed-out Continue button cannot say which of step 3's dozen fields is
 * the one holding it shut.
 *
 * The payload keys are deliberately the ones the backend's `sanitiseApplication`
 * already names — `selectedDays` and `dayTimeSlots` as siblings, `shopNo` and
 * `floor` as address parts, `sameAsOwner` as a flag rather than a resolved
 * number. None of that is a coincidence: that reader was written against this
 * form, so the form sends what it reads rather than a shape it has to guess at.
 */

import { CONTRACT_COMMISSION, CONTRACT_PLATFORM_FEE } from './restaurantOptions';

const trim = (value) => String(value ?? '').trim();

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
      /* Ticked on step 3, stored with the rest of what was agreed. Its own
         flag rather than folded into `accepted`, because the two were ticked
         at different moments against different words and the settlement
         dispute this exists for turns on which one was read. The server sets
         the timestamp beside it. */
      refundPolicyAccepted: form.refundPolicyAccepted,
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

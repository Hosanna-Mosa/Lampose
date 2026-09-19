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

import { hasBankDetails } from './validateRestaurant';

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
      /* Asked for on the FSSAI step, because FoSCoS needs them beside the
         licence number — but sent HERE, because a state and a district are
         parts of an address and the schema has exactly one place for them.
         Two homes for one value is how a console ends up showing a state that
         disagrees with the certificate it was read off. */
      state: trim(form.state),
      district: trim(form.district),
      landmark: trim(form.landmark),
    },

    selectedDays: form.selectedDays,
    dayTimeSlots,

    panNumber: trim(form.panNumber).toUpperCase(),
    gstin: trim(form.gstin).toUpperCase(),
    gstExempt: form.gstExempt,

    /*
     * The Aadhaar, and the proof that its mobile answered.
     *
     * `verificationToken` is what the backend re-checks; it is deliberately
     * NOT a `verified: true`. The server compares the number inside the token
     * against `phone` beside it and stamps `aadhaar.verifiedAt` itself, so
     * nothing sent from here can assert a verification that never happened.
     *
     * It travels in the BODY rather than the Authorization header because
     * that header already carries the AGENT's staff token: an application is
     * signed by two identities at once and they cannot share one header.
     */
    aadhaar: {
      number: trim(form.aadhaarNumber).replace(/\D/g, ''),
      phone: trim(form.aadhaarPhone).replace(/\D/g, ''),
      verificationToken: trim(form.aadhaarToken),
    },

    fssaiNumber: trim(form.fssaiNumber),
    fssaiExpiry: trim(form.fssaiExpiry),
    /* The licence holder's registered name. Sent beside the number rather than
       folded into `restaurantName`, because the two legitimately differ and the
       FoSCoS lookup matches on this one. */
    fssaiCompanyName: trim(form.fssaiCompanyName),

    /*
     * All of it, or NONE of it.
     *
     * `accountHolderName` is pre-filled from the owner's name, so it is on
     * every form whether or not anybody opened this section — and the backend
     * reads a holder name as proof the payout was started, then refuses the
     * application for the account number and IFSC that are missing beside it.
     * Sending the name on its own therefore turned an optional section into a
     * refusal at the end of a twenty-minute form, with a message naming two
     * boxes the agent had skipped on purpose.
     *
     * `hasBankDetails` is the same predicate the form's own rules gate on, so
     * what is VALIDATED as started and what is SENT as started cannot drift.
     */
    bank: hasBankDetails(form)
      ? {
        accountHolderName: trim(form.accountHolderName),
        accountNumber: trim(form.bankAccount),
        accountType: form.accountType,
        ifsc: trim(form.ifsc).toUpperCase(),
      }
      : {},

    contract: {
      accepted: form.acceptedTos,
      signature: trim(form.signature),
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

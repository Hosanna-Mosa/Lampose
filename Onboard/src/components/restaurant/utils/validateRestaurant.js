/**
 * What has to be true before a restaurant application may be sent.
 *
 * ## Why this is its own file
 *
 * The four steps used to gate on four booleans in `buildApplication.js`, and a
 * boolean can only grey the Continue button out — it cannot say WHICH of the
 * eleven fields on step 3 is the one holding it shut. This returns a message
 * per field instead, so the form can print it against the input it belongs to
 * and scroll to it, and so the same rules can be read once at submit.
 *
 * ## It is still one half of an agreement with the backend
 *
 * `validateApplication` in `foodPartner.util.js` refuses an application these
 * rules should never have let through, and when the two disagree the agent
 * meets a 400 at the END of a twenty-minute form. Every rule below that has a
 * server-side twin says so beside it; a rule with no twin is this form being
 * stricter on purpose, never looser.
 *
 * ## The contract
 *
 * `validateRestaurant(form)` returns a flat `{ [fieldKey]: message }` map for
 * the WHOLE form — empty means it may be submitted. Keys are form fields
 * (`ownerPhone`) or a per-day key built by `hoursKey` (`hours:Monday`), so a
 * message can be printed against one control rather than in a list at the top.
 *
 * Every message says what to do, not what went wrong: "Enter all 10 digits"
 * rather than "Invalid".
 */

import { DAYS } from './restaurantOptions';

/* ------------------------------------------------------------------ *
 * Limits
 * ------------------------------------------------------------------ */

/* The upload route's own ceiling (`MAX_IMAGE_BYTES` in
   `foodUpload.controller.js`). Checked here as well because the uploads
   happen at SUBMIT: without it, a 30MB photograph of a PAN card is not
   discovered until the agent has filled in the rest of the form and pressed
   the last button. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const FSSAI_DIGITS = 14;
const MIN_ACCOUNT_DIGITS = 9;
const MAX_ACCOUNT_DIGITS = 18;

/* An FSSAI licence runs five years at most, so anything beyond ten is a year
   typed wrong — and an expiry in 2035 silently passes every other check. */
const MAX_EXPIRY_YEARS = 10;

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const onlyDigits = (value) => text(value).replace(/\D/g, '');
const hasLetters = (value) => /[a-zA-Z]/.test(text(value));
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text(value));
const isHttpUrl = (value) => /^https?:\/\/\S+$/i.test(text(value));

/**
 * An Indian mobile number, which is the only kind this form collects.
 *
 * Ten digits opening 6-9 — the same test the backend's `isIndianMobile`
 * applies, and it refuses the application otherwise. The repeated-digit test
 * is this form being stricter: 9999999999 is what gets typed to get past a
 * required field, and it is the reason a rider stands outside a closed
 * shutter with nobody to ring.
 */
const isIndianMobile = (value) => {
  const digits = onlyDigits(value);
  if (!/^[6-9]\d{9}$/.test(digits)) return false;
  if (/^(\d)\1{9}$/.test(digits)) return false;
  return true;
};

/* Shapes, not registries. Each of these is the published format of the
   document, so a transposed character is caught in the room where the card is
   in somebody's hand rather than a week later in the verification queue. */
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/*
 * GSTIN: two state digits, a PAN, an entity number, and two trailing
 * characters.
 *
 * Deliberately NOT the full checksum. A checksum would catch one more class of
 * typo and would also refuse the occasional legitimate number this form has no
 * way to verify — and a refused real GSTIN is an onboarding that cannot be
 * completed at all, which is a worse failure than one stored with a typo that
 * the verification queue will see beside the scan.
 */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/;

/** 01–38 are the assigned state codes; 97 (other territory) and 99 also exist. */
const isGstStateCode = (code) => {
  const number = Number(code);
  return (number >= 1 && number <= 38) || number === 97 || number === 99;
};

/** The per-day key for a problem with that day's opening hours. */
export const hoursKey = (day) => `hours:${day}`;

/* ------------------------------------------------------------------ *
 * Where each message is printed
 * ------------------------------------------------------------------ */

/** Error key → the DOM id to scroll to and focus. */
const FIELD_ANCHORS = {
  restaurantName: 'rst-name',
  cuisines: 'rst-cuisines',
  ownerName: 'rst-owner',
  ownerEmail: 'rst-email',
  ownerPhone: 'rst-phone',
  primaryContact: 'rst-contact',
  mapLink: 'rst-maplink',
  area: 'rst-area',
  city: 'rst-city',
  landmark: 'rst-landmark',

  selectedDays: 'rst-days',

  panNumber: 'rst-pan',
  /* The drop zone's wrapper, not the `<input type="file">` inside it — that
     input is `display: none`, so scrolling to it moves nothing. */
  panFile: 'rst-pan-file-field',
  gstin: 'rst-gstin',
  fssaiNumber: 'rst-fssai',
  fssaiExpiry: 'rst-fssai-expiry',
  fssaiFile: 'rst-fssai-file-field',
  accountHolderName: 'rst-holder',
  bankAccount: 'rst-acct',
  bankConfirm: 'rst-acct2',
  ifsc: 'rst-ifsc',
  refundPolicyAccepted: 'rst-refund',

  acceptedTos: 'rst-tos',
  signature: 'rst-signature',
};

/** The id to scroll to for any error key, including the per-day hours keys. */
export const anchorFor = (key) => {
  if (FIELD_ANCHORS[key]) return FIELD_ANCHORS[key];
  if (key.startsWith('hours:')) return 'rst-hours';
  return null;
};

/*
 * Which step each field is asked on, and the order it appears in reading down
 * that step. One list does both jobs: the form shows a step's problems by
 * filtering on it, and the "jump to the first problem" scroll follows it —
 * without the order, that jump lands wherever `Object.keys` happens to put
 * things, which on a long form reads as random.
 */
export const STEP_FIELDS = {
  1: [
    'restaurantName', 'cuisines',
    'ownerName', 'ownerEmail', 'ownerPhone', 'primaryContact',
    'mapLink', 'area', 'city', 'landmark',
  ],
  2: ['selectedDays', ...DAYS.map(hoursKey)],
  3: [
    'panNumber', 'panFile', 'gstin',
    'fssaiNumber', 'fssaiExpiry', 'fssaiFile',
    'accountHolderName', 'bankAccount', 'bankConfirm', 'ifsc',
    'refundPolicyAccepted',
  ],
  4: ['acceptedTos', 'signature'],
};

/** Which step a field belongs to, so a message can be shown on its own step. */
export const stepOfField = (key) => {
  const found = Object.keys(STEP_FIELDS)
    .find((step) => STEP_FIELDS[step].includes(key));
  return found ? Number(found) : null;
};

/** Just the problems belonging to one step, in the order they appear on it. */
export const errorsForStep = (errors, step) => {
  const subset = {};
  (STEP_FIELDS[step] || []).forEach((key) => {
    if (errors[key]) subset[key] = errors[key];
  });
  return subset;
};

/** The first problem a human would meet reading down the form. */
export const firstErrorKey = (errors) => {
  for (let step = 1; step <= 4; step += 1) {
    const ordered = (STEP_FIELDS[step] || []).filter((key) => errors[key]);
    if (ordered.length > 0) return ordered[0];
  }
  return Object.keys(errors)[0] || null;
};

/** The first step still holding a problem, or null when the form is clean. */
export const firstBadStep = (errors) => {
  const key = firstErrorKey(errors);
  return key ? stepOfField(key) : null;
};

/* ------------------------------------------------------------------ *
 * The rules
 * ------------------------------------------------------------------ */

/**
 * @param {object} form the whole wizard state
 * @returns {Record<string,string>} field key → message; empty means valid
 */
export function validateRestaurant(form = {}) {
  return {
    ...validateStep1(form),
    ...validateStep2(form),
    ...validateStep3(form),
    ...validateStep4(form),
  };
}

/* ── Step 1 — the restaurant, the owner, the door ─────────────────────────── */

function validateStep1(form) {
  const errs = {};

  const name = text(form.restaurantName);
  if (!name) errs.restaurantName = 'Enter the restaurant name';
  else if (name.length < 3) errs.restaurantName = 'Give the full name, at least 3 characters';
  else if (!hasLetters(name)) errs.restaurantName = 'A restaurant name needs letters, not only numbers';

  /* The backend refuses an application with no cuisine, and the listing
     screen's filter chips query this field — a restaurant filed under nothing
     is one nobody browsing can reach. */
  if (!Array.isArray(form.cuisines) || form.cuisines.length === 0) {
    errs.cuisines = 'Pick at least one cuisine — this is what a diner filters on';
  }

  const ownerName = text(form.ownerName);
  if (!ownerName) errs.ownerName = "Enter the owner's full name";
  else if (ownerName.length < 3) errs.ownerName = "Give the owner's full name";
  else if (!hasLetters(ownerName)) errs.ownerName = 'A name needs letters, not only numbers';

  const email = text(form.ownerEmail);
  if (!email) errs.ownerEmail = 'Enter an email address';
  else if (!isEmail(email)) errs.ownerEmail = 'This does not look like an email address, e.g. owner@business.com';

  /*
   * Checked for SHAPE, not for possession.
   *
   * There is no one-time code: the agent is standing with the owner and reads
   * the number off their phone. The shape is still enforced, because the
   * backend refuses anything that is not an Indian mobile and this is the
   * number a rider rings from outside the shutter.
   */
  const phone = onlyDigits(form.ownerPhone);
  if (!phone) {
    errs.ownerPhone = "Enter the owner's mobile number";
  } else if (phone.length !== 10) {
    errs.ownerPhone = `Enter all 10 digits — you have typed ${phone.length}`;
  } else if (!isIndianMobile(phone)) {
    errs.ownerPhone = 'Enter a real 10-digit mobile number starting 6, 7, 8 or 9';
  }

  /* Only when the box is unticked, which is somebody saying there IS a second
     number. A half-typed one then looks like a recorded support contact and is
     useless to whoever dials it. */
  if (!form.sameAsOwner) {
    const contact = onlyDigits(form.primaryContact);
    if (!contact) {
      errs.primaryContact = 'Enter the support number, or tick "Same as owner mobile number"';
    } else if (contact.length !== 10) {
      errs.primaryContact = `Enter all 10 digits — you have typed ${contact.length}`;
    } else if (!isIndianMobile(contact)) {
      errs.primaryContact = 'Enter a real 10-digit mobile number starting 6, 7, 8 or 9';
    }
  }

  /* The pin itself stays optional — a fix is not always available indoors —
     but a box holding something that is not a link at all is a paste that went
     wrong, and it silently carries no coordinates. */
  const link = text(form.mapLink);
  if (link && !isHttpUrl(link)) {
    errs.mapLink = 'Paste the whole Google Maps link (it starts with https://), or leave this blank';
  }

  const area = text(form.area);
  if (!area) errs.area = 'Enter the area, sector or locality';
  else if (area.length < 3) errs.area = 'Give the full locality, e.g. HSR Layout, Sector 1';

  const city = text(form.city);
  if (!city) errs.city = 'Enter the city';
  else if (city.length < 3) errs.city = 'Give the full city name';
  else if (!hasLetters(city)) errs.city = 'A city name needs letters, not only numbers';

  /* Not decoration: this is what a rider reads when the map pin puts them on
     the wrong side of a divided road. */
  const landmark = text(form.landmark);
  if (!landmark) errs.landmark = 'Enter a nearby landmark — this is what a rider looks for';
  else if (landmark.length < 3) errs.landmark = 'Give a landmark somebody could find, e.g. Near City Mall';

  return errs;
}

/* ── Step 2 — when the kitchen is open ────────────────────────────────────── */

/** "09:30" → 570. NaN for anything that is not a time. */
const minutesOf = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text(value));
  if (!match) return NaN;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return NaN;
  return (hours * 60) + mins;
};

function validateStep2(form) {
  const errs = {};
  const days = Array.isArray(form.selectedDays) ? form.selectedDays : [];

  if (days.length === 0) {
    errs.selectedDays = 'Tick the days this kitchen takes orders — the backend refuses an application with none';
    return errs;
  }

  days.forEach((day) => {
    const slots = (form.dayTimeSlots || {})[day] || [];

    if (slots.length === 0) {
      errs[hoursKey(day)] = `Add opening hours for ${day}, or untick it`;
      return;
    }

    const bad = slots.findIndex((slot) => !text(slot.open) || !text(slot.close));
    if (bad !== -1) {
      errs[hoursKey(day)] = `${day}: fill in both the opening and the closing time`;
      return;
    }

    /* A closing time EARLIER than the opening one is not an error — a kitchen
       that shuts at 01:00 is ordinary. The same time twice is: it describes a
       day that is open for no minutes, and it is what an accidental second tap
       on a time picker leaves behind. */
    const equal = slots.find((slot) => text(slot.open) === text(slot.close));
    if (equal) {
      errs[hoursKey(day)] = `${day}: opening and closing are both ${equal.open} — that is a day open for no time at all`;
      return;
    }

    const unreadable = slots.find((slot) => Number.isNaN(minutesOf(slot.open)) || Number.isNaN(minutesOf(slot.close)));
    if (unreadable) {
      errs[hoursKey(day)] = `${day}: enter the times as HH:MM`;
      return;
    }

    /* Two identical slots are a duplicate rather than a break — the second one
       adds nothing and doubles the row the kitchen's open/closed check reads. */
    const seen = new Set();
    const duplicate = slots.find((slot) => {
      const signature = `${slot.open}-${slot.close}`;
      if (seen.has(signature)) return true;
      seen.add(signature);
      return false;
    });
    if (duplicate) {
      errs[hoursKey(day)] = `${day}: ${duplicate.open}–${duplicate.close} is listed twice — remove one`;
    }
  });

  return errs;
}

/* ── Step 3 — the papers, and where the money goes ────────────────────────── */

/** A picked file that is too big or of a kind the upload route will not take. */
const fileProblem = (file, what) => {
  if (!file) return null;
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `That ${what} is ${mb}MB — the limit is 10MB. Re-take it at a lower resolution.`;
  }
  /* The picker asks for `image/*,.pdf`, but a drag-and-drop bypasses `accept`
     entirely and the upload route would refuse it at submit. */
  const type = String(file.type || '');
  const isPdf = type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
  if (type && !type.startsWith('image/') && !isPdf) {
    return `That ${what} is not a photo or a PDF — attach a scan or a photograph.`;
  }
  return null;
};

function validateStep3(form) {
  const errs = {};

  /* PAN is optional to the backend by field spec but mandatory here: it is
     one of the two documents this console exists to collect, and the scan is
     filed against the number. */
  const pan = text(form.panNumber).toUpperCase();
  if (!pan) errs.panNumber = 'Enter the PAN number';
  else if (pan.length !== 10) errs.panNumber = `A PAN is 10 characters — you have typed ${pan.length}`;
  else if (!PAN_RE.test(pan)) errs.panNumber = 'A PAN reads five letters, four digits, one letter, e.g. ABCDE1234F';

  if (!form.panFile) errs.panFile = 'Attach a photo or scan of the PAN card';
  else {
    const problem = fileProblem(form.panFile, 'PAN scan');
    if (problem) errs.panFile = problem;
  }

  /*
   * GSTIN is OPTIONAL.
   *
   * The composition scheme and small turnovers are ordinary, plenty of
   * kitchens have not registered at all, and an agent standing at a counter
   * cannot conjure a number the owner does not have — a required field there
   * gets a made-up value rather than a blank one. What IS enforced is that
   * anything typed is a real GSTIN, and that a number and the exempt box are
   * not both claimed at once, which the backend refuses in those words.
   */
  const gstin = text(form.gstin).toUpperCase();
  if (form.gstExempt && gstin) {
    errs.gstin = 'This is marked exempt — clear the GSTIN, or untick the exempt box';
  } else if (gstin) {
    if (gstin.length !== 15) errs.gstin = `A GSTIN is 15 characters — you have typed ${gstin.length}`;
    else if (!GSTIN_RE.test(gstin)) errs.gstin = 'A GSTIN reads two digits, a PAN, then three more characters, e.g. 22AAAAA0000A1Z5';
    else if (!isGstStateCode(gstin.slice(0, 2))) errs.gstin = 'The first two digits are the state code — 22AAAAA0000A1Z5 style. Check them.';
  }

  const fssai = onlyDigits(form.fssaiNumber);
  if (!fssai) errs.fssaiNumber = 'Enter the FSSAI licence number';
  else if (fssai.length !== FSSAI_DIGITS) {
    errs.fssaiNumber = `An FSSAI number is ${FSSAI_DIGITS} digits — you have typed ${fssai.length}`;
  }

  /* The backend refuses a licence that has already expired, so it is refused
     here rather than at the end of the form. */
  const expiry = text(form.fssaiExpiry);
  if (!expiry) {
    errs.fssaiExpiry = 'Enter the FSSAI expiry date';
  } else {
    const when = new Date(`${expiry}T00:00:00`);
    if (Number.isNaN(when.getTime())) {
      errs.fssaiExpiry = 'Enter the expiry date as it reads on the licence';
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const ceiling = new Date(today);
      ceiling.setFullYear(ceiling.getFullYear() + MAX_EXPIRY_YEARS);

      if (when < today) {
        errs.fssaiExpiry = 'This licence has already expired — the application will be refused. Ask for the renewed one.';
      } else if (when > ceiling) {
        errs.fssaiExpiry = `That is more than ${MAX_EXPIRY_YEARS} years away — check the year`;
      }
    }
  }

  if (!form.fssaiFile) errs.fssaiFile = 'Attach a photo or scan of the FSSAI licence';
  else {
    const problem = fileProblem(form.fssaiFile, 'FSSAI scan');
    if (problem) errs.fssaiFile = problem;
  }

  /*
   * The payout block is all-or-nothing on the backend ("an account number with
   * no IFSC is money that cannot be sent"), and this console asks for all of
   * it: a settlement that cannot be paid is discovered a week later by the
   * restaurant, not by us.
   */
  const holder = text(form.accountHolderName);
  if (!holder) errs.accountHolderName = "Enter the account holder's name exactly as the bank holds it";
  else if (holder.length < 3) errs.accountHolderName = 'Give the full name on the account';
  else if (!hasLetters(holder)) errs.accountHolderName = 'A name needs letters, not only numbers';

  const account = onlyDigits(form.bankAccount);
  if (!account) {
    errs.bankAccount = 'Enter the bank account number';
  } else if (account.length < MIN_ACCOUNT_DIGITS || account.length > MAX_ACCOUNT_DIGITS) {
    errs.bankAccount = `A bank account number is ${MIN_ACCOUNT_DIGITS} to ${MAX_ACCOUNT_DIGITS} digits — you have typed ${account.length}`;
  }

  /* Typed twice on purpose, so the two are compared rather than trusted. */
  const confirm = onlyDigits(form.bankConfirm);
  if (!confirm) errs.bankConfirm = 'Type the account number again';
  else if (account && confirm !== account) errs.bankConfirm = 'The two account numbers do not match';

  const ifsc = text(form.ifsc).toUpperCase();
  if (!ifsc) {
    errs.ifsc = 'Enter the IFSC code';
  } else if (ifsc.length !== 11) {
    errs.ifsc = `An IFSC is 11 characters — you have typed ${ifsc.length}`;
  } else if (!IFSC_RE.test(ifsc)) {
    errs.ifsc = 'An IFSC reads four letters, a zero, then six characters, e.g. HDFC0001234';
  } else if (!form.ifscFetched) {
    errs.ifsc = 'Tap Confirm IFSC to check this is the branch you mean';
  }

  /*
   * The refund policy, ticked on the screen that prints it.
   *
   * Required here and nowhere else: the backend stores the acknowledgement but
   * does not refuse an application without it, the same way it treats the PAN
   * number, because a rule added to `validateApplication` refuses every client
   * that predates the field. The form is the place this is asked for, so the
   * form is the place it is insisted on.
   */
  if (!form.refundPolicyAccepted) {
    errs.refundPolicyAccepted = 'Read the refund and cancellation policy to the owner and tick the box';
  }

  return errs;
}

/* ── Step 4 — the agreement ───────────────────────────────────────────────── */

function validateStep4(form) {
  const errs = {};

  if (!form.acceptedTos) {
    errs.acceptedTos = 'The owner has to accept the partner contract before this can be sent';
  }

  const signature = text(form.signature);
  if (!signature) errs.signature = "Type the owner's full name as the digital signature";
  else if (signature.length < 3) errs.signature = 'Type the full legal name';
  else if (!hasLetters(signature)) errs.signature = 'A signature needs letters, not only numbers';

  return errs;
}

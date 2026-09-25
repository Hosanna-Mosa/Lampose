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

import { DAYS, INDIAN_STATES, isMenuItemStarted } from './restaurantOptions';

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
const AADHAAR_DIGITS = 12;
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

/**
 * Did anybody actually START the bank block?
 *
 * Exported because TWO files have to agree on it and they used not to. The
 * rules below read it to decide whether to demand the rest of the block, and
 * `buildApplication.js` reads it to decide whether to SEND the block at all —
 * and the second one is the reason this is a function rather than four lines
 * repeated twice.
 *
 * `accountHolderName` is deliberately not part of the test. It is pre-filled
 * from the owner's name the moment step 1 is filled in, so it is present on
 * every form that has never been near this section; counting it would make
 * "the bank details are optional" a promise the form cannot keep.
 *
 * The backend's `validateApplication` DOES count a holder name — its
 * `payoutStarted` is `accountNumber || ifsc || accountHolderName`. That is not
 * a disagreement to fix there: a payout arriving with a name and no account is
 * genuinely half a payout, and the server is right to say so. It is this form's
 * job not to send one, which is what `buildApplication.js` now uses this for.
 * Before that it sent the pre-filled name with an empty account and the
 * application was refused at the very end with a message about bank details
 * the agent had deliberately skipped.
 */
export const hasBankDetails = (form = {}) => {
  const digits = (value) => String(value ?? '').replace(/\D/g, '');
  return Boolean(
    digits(form.bankAccount) || digits(form.bankConfirm) || String(form.ifsc ?? '').trim(),
  );
};

/** The per-day key for a problem with that day's opening hours. */
export const hoursKey = (day) => `hours:${day}`;

/* The per-dish key for a problem with a menu row. Keyed by POSITION rather
   than by the row's uid, because the message is printed against the box the
   agent is looking at and the boxes are numbered "Dish 1", "Dish 2" on screen
   — a uid in the key would be right and unreadable. */
export const menuKey = (index, field) => `menu:${index}:${field}`;

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
  /* The drop zone's wrapper, which is what `FileDrop` gives the `-field` id
     to — the input inside it is `display: none`. */
  logoFile: 'rst-logo-file-field',

  panNumber: 'rst-pan',
  aadhaarNumber: 'rst-aadhaar',
  aadhaarPhone: 'rst-aadhaar-phone',
  /* The drop zone's wrapper, not the `<input type="file">` inside it — that
     input is `display: none`, so scrolling to it moves nothing. */
  panFile: 'rst-pan-file-field',
  gstin: 'rst-gstin',
  fssaiNumber: 'rst-fssai',
  fssaiCompanyName: 'rst-fssai-company',
  state: 'rst-state',
  district: 'rst-district',
  fssaiExpiry: 'rst-fssai-expiry',
  fssaiFile: 'rst-fssai-file-field',
  accountHolderName: 'rst-holder',
  bankAccount: 'rst-acct',
  bankConfirm: 'rst-acct2',
  ifsc: 'rst-ifsc',

  acceptedTos: 'rst-tos',
  signature: 'rst-signature',
};

/** The id to scroll to for any error key, including the per-day hours keys. */
export const anchorFor = (key) => {
  if (FIELD_ANCHORS[key]) return FIELD_ANCHORS[key];
  if (key.startsWith('hours:')) return 'rst-hours';
  /* The dish's own card, not the box inside it: a scroll that lands on the
     price of dish 7 with no heading above it says nothing about which dish. */
  if (key.startsWith('menu:')) return `rst-menu-${key.split(':')[1]}`;
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
  /* The menu's keys are not listed: there is no fixed number of dishes. They
     are carried by `stepOfField` and picked up by `errorsForStep` below. */
  2: ['selectedDays', ...DAYS.map(hoursKey), 'logoFile', 'menu'],
  3: [
    'panNumber', 'panFile', 'gstin',
    'aadhaarNumber', 'aadhaarPhone',
    'fssaiNumber', 'fssaiExpiry', 'fssaiFile',
    'fssaiCompanyName', 'state', 'district',
    'accountHolderName', 'bankAccount', 'bankConfirm', 'ifsc',
  ],
  4: ['acceptedTos', 'signature'],
};

/** Which step a field belongs to, so a message can be shown on its own step. */
export const stepOfField = (key) => {
  if (String(key).startsWith('menu:')) return 2;
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
  /* Anything belonging to this step that the list above cannot name — the menu
     rows, whose count is whatever the agent typed. Added after the named ones
     so the ordering the list exists for still holds for everything in it. */
  Object.keys(errors).forEach((key) => {
    if (!subset[key] && stepOfField(key) === step) subset[key] = errors[key];
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

  /*
   * OPTIONAL, and checked only for shape when one is given.
   *
   * Plenty of the owners this console signs up do not use email, and the one
   * that was typed to get past a required box — `owner@gmail.com`, `na@na.com`
   * — is worse than the empty field: it is a login identity that belongs to
   * somebody else and a settlement notice sent into the dark. The account is
   * identified by the MOBILE number, which is the credential the owner
   * actually has; the backend's `validateApplication` agrees and its unique
   * index on `ownerEmail` is now sparse so several restaurants may have none.
   */
  const email = text(form.ownerEmail);
  if (email && !isEmail(email)) {
    errs.ownerEmail = 'This does not look like an email address, e.g. owner@business.com';
  }

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

  /* Both optional, and both only checked for being a picture we can actually
     upload — see `imageProblem`. */
  const logo = imageProblem(form.logoFile, 'profile image');
  if (logo) errs.logoFile = logo;

  if (days.length === 0) {
    errs.selectedDays = 'Tick the days this kitchen takes orders — the backend refuses an application with none';
    /* The menu still speaks. An agent who typed a dish and has not yet ticked
       a day should not have that dish's problems appear only after they do. */
    return { ...errs, ...validateMenu(form) };
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

  return { ...errs, ...validateMenu(form) };
}

/*
 * The menu — optional as a whole, exact once a row has been started.
 *
 * The three rules are the backend's, one for one: `validateApplication`
 * refuses an item with no name, no category, or a price below zero, and a
 * discount that is not below the full price. They are repeated here rather
 * than left to the server because the server answers at the END of a
 * twenty-minute form with one sentence naming three dishes, and this answers
 * against the box.
 *
 * A row nobody typed into is not checked and is not sent — see
 * `isMenuItemStarted`. "Add a dish" pressed by accident is not a refusal.
 */
/*
 * A picked picture that is too big or is not a picture.
 *
 * `fileProblem` on step 3 also takes a PDF, because a licence is often scanned
 * as one. These are photographs that end up on a menu card and in a feed, and
 * the upload route stores images — so a PDF here is a file that would be
 * refused at submit, after the form said it was fine.
 */
const imageProblem = (file, what) => {
  if (!file) return null;
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `That ${what} is ${mb}MB — the limit is 10MB. Take it again at a lower resolution.`;
  }
  /* The picker asks for `image/*`, and a drag-and-drop ignores `accept`. */
  if (String(file.type || '') && !String(file.type).startsWith('image/')) {
    return `That ${what} is not a picture — attach a JPG or a PNG.`;
  }
  return null;
};

function validateMenu(form) {
  const errs = {};
  const items = Array.isArray(form.menuItems) ? form.menuItems : [];

  items.forEach((item, index) => {
    if (!isMenuItemStarted(item)) return;

    if (!text(item.name)) errs[menuKey(index, 'name')] = 'Name this dish, or remove the row';
    if (!text(item.category)) errs[menuKey(index, 'category')] = 'Give it a category — this is the heading it sits under on the menu';

    /* An empty box and a zero are different answers: empty is "not priced
       yet", which cannot be sent, and zero is a dish given away, which can. */
    const priced = text(item.price) !== '';
    const price = Number(item.price);
    if (!priced) {
      errs[menuKey(index, 'price')] = 'Enter the price';
    } else if (!Number.isFinite(price) || price < 0) {
      errs[menuKey(index, 'price')] = 'Enter a price of zero or more';
    }

    const photo = imageProblem(item.photoFile, 'dish photo');
    if (photo) errs[menuKey(index, 'photo')] = photo;

    const offered = text(item.discountedPrice) !== '';
    const offer = Number(item.discountedPrice);
    if (offered && (!Number.isFinite(offer) || offer < 0)) {
      errs[menuKey(index, 'discountedPrice')] = 'Enter an offer price of zero or more, or leave it empty';
    } else if (offered && priced && Number.isFinite(price) && offer >= price) {
      errs[menuKey(index, 'discountedPrice')] = `An offer price has to be below the full price of ₹${price}`;
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

  /*
   * The scan is OPTIONAL — the NUMBER is not.
   *
   * An agent is often given a number off a card that is in a drawer at home,
   * or photographs it in light that produces an unreadable file. Refusing the
   * application for it stops an onboarding that is otherwise complete, and the
   * verification queue can ask for the scan afterwards against a restaurant
   * that already exists. What is still enforced is that anything ATTACHED can
   * actually be uploaded: a 30MB photograph fails at submit, after the rest of
   * the form has been filled in, which is the worst possible moment to hear it.
   */
  const panProblem = fileProblem(form.panFile, 'PAN scan');
  if (panProblem) errs.panFile = panProblem;

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

  /*
   * The owner's Aadhaar, and the mobile it is registered against.
   *
   * ## Shape only, and deliberately so
   *
   * Nothing in this process can ask UIDAI whether a number exists. What is
   * checked is what a card can be read against: twelve digits, and the two
   * impossibilities that catch a slipped hand — a repeated digit, and a
   * leading 0 or 1, which UIDAI never issues. A checksum would refuse the
   * occasional real number typed correctly, and a partner who cannot be
   * onboarded at all is a worse failure than one the verification queue
   * catches beside the scan.
   */
  const aadhaar = onlyDigits(form.aadhaarNumber);
  if (!aadhaar) {
    errs.aadhaarNumber = 'Enter the 12-digit Aadhaar number';
  } else if (aadhaar.length !== AADHAAR_DIGITS) {
    errs.aadhaarNumber = `An Aadhaar number is ${AADHAAR_DIGITS} digits — you have typed ${aadhaar.length}`;
  } else if (/^(\d)\1{11}$/.test(aadhaar)) {
    errs.aadhaarNumber = 'That is the same digit twelve times — read the number off the card again';
  } else if (aadhaar[0] === '0' || aadhaar[0] === '1') {
    errs.aadhaarNumber = 'An Aadhaar number never begins with 0 or 1 — check the first digit';
  }

  const aadhaarPhone = onlyDigits(form.aadhaarPhone);
  if (!aadhaarPhone) {
    errs.aadhaarPhone = 'Enter the mobile number registered against this Aadhaar';
  } else if (aadhaarPhone.length !== 10) {
    errs.aadhaarPhone = `Enter all 10 digits — you have typed ${aadhaarPhone.length}`;
  } else if (!isIndianMobile(aadhaarPhone)) {
    errs.aadhaarPhone = 'Enter a real 10-digit mobile number starting 6, 7, 8 or 9';
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

  /*
   * The state and the district, which are FSSAI fields before they are
   * address fields.
   *
   * FoSCoS looks a licence up by company name, licence number, state AND
   * district together. A verifier holding three of those four cannot run the
   * check at all — they can only guess, or ring the restaurant back — so both
   * are required here even though the backend, which has to keep accepting
   * the Food-Partner app's own signup, asks for neither.
   *
   * The state is checked against the list the dropdown is built from rather
   * than merely for being non-empty. That catches the one case a dropdown
   * still lets through: a value restored from an older draft, or renamed
   * upstream, which looks filled in and returns nothing on the portal.
   */
  /* The name the licence is HELD in, which is not always the name over the
     door — the portal matches on the registered entity. Its own field rather
     than `restaurantName` for that reason, and checked the same way every
     other name on this form is. */
  const company = text(form.fssaiCompanyName);
  if (!company) {
    errs.fssaiCompanyName = 'Enter the company name as it reads on the licence';
  } else if (company.length < 3) {
    errs.fssaiCompanyName = 'Give the full company name from the certificate';
  } else if (!hasLetters(company)) {
    errs.fssaiCompanyName = 'A company name needs letters, not only numbers';
  }

  const stateName = text(form.state);
  if (!stateName) {
    errs.state = 'Pick the state on the licence — FoSCoS cannot look it up without one';
  } else if (!INDIAN_STATES.includes(stateName)) {
    errs.state = 'Pick a state from the list';
  }

  /* Free text, so the check is that somebody typed a place rather than a
     placeholder. See INDIAN_STATES for why this is not a dropdown. */
  const district = text(form.district);
  if (!district) {
    errs.district = 'Enter the district exactly as it reads on the licence';
  } else if (district.length < 3) {
    errs.district = 'Give the full district name as FoSCoS spells it, e.g. Greater Hyderabad Municipal Corporation';
  } else if (!hasLetters(district)) {
    errs.district = 'A district name needs letters, not only numbers';
  }

  /* Optional for the same reason the PAN scan is, and for the same reason
     the NUMBER and the EXPIRY above it are not: the backend refuses an
     application with no FSSAI number or an expired licence, so those two are
     the ones that have to be right here. */
  const fssaiProblem = fileProblem(form.fssaiFile, 'FSSAI scan');
  if (fssaiProblem) errs.fssaiFile = fssaiProblem;

  /*
   * The payout block is OPTIONAL, and all-or-nothing.
   *
   * Optional because a bank account is the one thing on this form the owner
   * frequently cannot produce in the room — the passbook is at home, the
   * current account is being opened, the account is in a partner's name and
   * nobody wants to guess. The first settlement is a week away, and the
   * backend says the same thing in the same words: "a partner may finish the
   * bank details later... so an empty payout is not a refusal."
   *
   * All-or-nothing because the backend's next sentence is "a HALF one is": an
   * account number with no IFSC is money that cannot be sent, and it is
   * discovered a week later by the restaurant rather than by us.
   *
   * `accountHolderName` deliberately does NOT open the block. It is
   * pre-filled from the owner's name the moment step 1 is filled in, so
   * counting it would make a form that has never been near this section look
   * like one where somebody started typing bank details — and would make the
   * whole "optional" promise a lie. The three fields below are the ones
   * nobody fills in by accident.
   */
  const holder = text(form.accountHolderName);
  const account = onlyDigits(form.bankAccount);
  const confirm = onlyDigits(form.bankConfirm);
  const ifsc = text(form.ifsc).toUpperCase();

  const bankStarted = hasBankDetails(form);

  if (bankStarted) {
    if (!holder) errs.accountHolderName = "Enter the account holder's name exactly as the bank holds it";
    else if (holder.length < 3) errs.accountHolderName = 'Give the full name on the account';
    else if (!hasLetters(holder)) errs.accountHolderName = 'A name needs letters, not only numbers';

    if (!account) {
      errs.bankAccount = 'Enter the bank account number, or clear the other bank boxes to skip this section';
    } else if (account.length < MIN_ACCOUNT_DIGITS || account.length > MAX_ACCOUNT_DIGITS) {
      errs.bankAccount = `A bank account number is ${MIN_ACCOUNT_DIGITS} to ${MAX_ACCOUNT_DIGITS} digits — you have typed ${account.length}`;
    }

    /* Typed twice on purpose, so the two are compared rather than trusted. */
    if (!confirm) errs.bankConfirm = 'Type the account number again';
    else if (account && confirm !== account) errs.bankConfirm = 'The two account numbers do not match';

    if (!ifsc) {
      errs.ifsc = 'Enter the IFSC code, or clear the other bank boxes to skip this section';
    } else if (ifsc.length !== 11) {
      errs.ifsc = `An IFSC is 11 characters — you have typed ${ifsc.length}`;
    } else if (!IFSC_RE.test(ifsc)) {
      errs.ifsc = 'An IFSC reads four letters, a zero, then six characters, e.g. HDFC0001234';
    } else if (!form.ifscFetched) {
      errs.ifsc = 'Tap Confirm IFSC to check this is the branch you mean';
    }
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

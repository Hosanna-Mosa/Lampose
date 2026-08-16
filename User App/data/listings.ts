import type { Listing } from '@/types/listing';

/**
 * Typed fixtures for discovery.
 *
 * Mock first, real API later — the shapes are the ones in `types/listing.ts`,
 * so swapping in a fetch is a change of source and not of components. The
 * values are the ones the Batch 3 sheet drew, kept intact so the built cards
 * can be compared against the design one field at a time.
 */

export const saiKrishnaPG: Listing = {
  /**
   * Three separate rates, never one divided. A short stay costs more per night
   * because the bed turns over — that is the owner's economics, not a penalty,
   * and showing all three lets a student see the crossover for themselves.
   */
  stayRates: [
    {
      id: 'DAILY',
      label: 'By the day',
      unit: 'day',
      pricePerUnit: 450,
      daysPerUnit: 1,
      unitOptions: [1, 2, 3, 5, 7],
      // No deposit on a stay this short. Shown as zero, never hidden.
      deposit: 0,
    },
    {
      id: 'WEEKLY',
      label: 'By the week',
      unit: 'week',
      pricePerUnit: 2600,
      daysPerUnit: 7,
      unitOptions: [1, 2, 3],
      deposit: 2000,
    },
    {
      id: 'MONTHLY',
      label: 'By the month',
      unit: 'month',
      pricePerUnit: 8500,
      daysPerUnit: 30,
      unitOptions: [1, 3, 6, 11],
      deposit: 17000,
    },
  ],
  mess: {
    available: true,
    pricePerDay: 150,
    summary: '2 meals a day · veg only · breakfast and dinner',
  },
  ownerName: 'Ramesh',
  id: 'lst-pg-0143',
  category: 'PG_HOSTEL',
  viewCount: 128,
  viewWindow: 'the last 7 days',
  name: 'Sai Krishna Boys PG',
  locality: 'Gachibowli',
  landmark: 'Behind Ratnadeep, opposite the water tank',
  gender: 'BOYS',
  photoCount: 4,

  rent: 8500,
  deposit: 17000,
  depositMonths: 2,
  areaMedianDepositMonths: 2,

  availability: { kind: 'BEDS', count: 3 },
  freshness: 'price 6 min old',

  meals: {
    included: true,
    mealsPerDay: 2,
    dietary: 'Veg only',
    slots: [
      { label: 'Breakfast', window: '7:30 – 9:00 am' },
      { label: 'Lunch' },
      { label: 'Dinner', window: '8:00 – 10:00 pm' },
    ],
    note: 'Sunday special · non-veg on request',
  },
  gateTime: '10:30 pm',
  sharingLabel: '2-sharing',

  amenities: [
    { name: 'wifi', state: 'present', qualifier: '40 Mbps' },
    { name: 'powerBackup', state: 'present', qualifier: 'inverter' },
    { name: 'waterSupply', state: 'present', qualifier: 'timed 6–9am' },
    { name: 'mess', state: 'present', qualifier: '2 meals · veg' },
    { name: 'attachedBath', state: 'present' },
    { name: 'laundry', state: 'present', qualifier: 'twice a week' },
    { name: 'studyTable', state: 'present' },
    { name: 'cupboard', state: 'present' },
    { name: 'hotWater', state: 'present', qualifier: 'geyser' },
    { name: 'cctv', state: 'present', qualifier: 'entrance only' },
    { name: 'warden', state: 'present' },
    { name: 'curfew', state: 'present', qualifier: 'gate 10:30 pm' },
    { name: 'parking', state: 'present' },
    { name: 'ac', state: 'absent' },
    { name: 'lift', state: 'absent' },
    { name: 'gym', state: 'absent' },
  ],

  houseRules: [
    {
      label: 'Entry timing',
      value: 'Gate closes 10:30 pm',
    },
    { label: 'Guests', value: 'Common room only' },
    { label: 'Smoking', value: 'Not allowed' },
    { label: 'Alcohol', value: 'Not allowed' },
    {
      label: 'Notice period',
      value: '30 days',
      glossary: {
        title: 'Notice period',
        body: 'How long before leaving you must tell the owner. Leave sooner and that much rent comes out of your deposit.',
      },
    },
    { label: 'Late entry', value: 'Warden permission' },
  ],

  sharingOptions: [
    {
      id: 'single', label: 'Single room', pricePerPerson: 14500, deposit: 29000, depositMonths: 2, bedsLeft: 1,
      ratePerUnit: { DAILY: 900, WEEKLY: 5200, MONTHLY: 14500 },
    },
    {
      id: 'two', label: 'Two sharing', pricePerPerson: 8500, deposit: 17000, depositMonths: 2, bedsLeft: 3, median: true,
      ratePerUnit: { DAILY: 550, WEEKLY: 3200, MONTHLY: 8500 },
    },
    {
      id: 'three', label: 'Three sharing', pricePerPerson: 6800, deposit: 13600, depositMonths: 2, bedsLeft: 0,
      ratePerUnit: { DAILY: 450, WEEKLY: 2600, MONTHLY: 6800 },
    },
    {
      id: 'four', label: 'Four sharing', pricePerPerson: 5900, deposit: 11800, depositMonths: 2, bedsLeft: 2,
      ratePerUnit: { DAILY: 400, WEEKLY: 2300, MONTHLY: 5900 },
    },
  ],


};

export const lakshmiHostel: Listing = {
  /**
   * Three separate rates, never one divided. A short stay costs more per night
   * because the bed turns over — that is the owner's economics, not a penalty,
   * and showing all three lets a student see the crossover for themselves.
   */
  stayRates: [
    {
      id: 'DAILY',
      label: 'By the day',
      unit: 'day',
      pricePerUnit: 380,
      daysPerUnit: 1,
      unitOptions: [1, 2, 3, 5, 7],
      // No deposit on a stay this short. Shown as zero, never hidden.
      deposit: 0,
    },
    {
      id: 'WEEKLY',
      label: 'By the week',
      unit: 'week',
      pricePerUnit: 2200,
      daysPerUnit: 7,
      unitOptions: [1, 2, 3],
      deposit: 2000,
    },
    {
      id: 'MONTHLY',
      label: 'By the month',
      unit: 'month',
      pricePerUnit: 6900,
      daysPerUnit: 30,
      unitOptions: [1, 3, 6, 11],
      deposit: 6900,
    },
  ],
  mess: {
    available: true,
    pricePerDay: 150,
    summary: '2 meals a day · veg only · breakfast and dinner',
  },
  ownerName: 'Lakshmi',
  id: 'lst-hs-0088',
  category: 'PG_HOSTEL',
  viewCount: 212,
  viewWindow: 'the last 3 days',
  name: 'Lakshmi Ladies Hostel',
  locality: 'Ameerpet',
  landmark: 'Opp. Ratnadeep, lane 3',
  gender: 'GIRLS',
  photoCount: 6,

  rent: 6200,
  perBed: true,
  deposit: 6200,
  depositMonths: 1,
  areaMedianDepositMonths: 2,

  availability: { kind: 'BEDS', count: 1 },
  freshness: 'price 2 min old',

  meals: {
    included: true,
    mealsPerDay: 3,
    dietary: 'Veg and non-veg',
    slots: [
      { label: 'Breakfast', window: '7:00 – 9:30 am' },
      { label: 'Lunch', window: '12:30 – 2:00 pm' },
      { label: 'Dinner', window: '8:00 – 9:30 pm' },
    ],
  },
  sharingLabel: '3-sharing',
  wardenOnSite: true,

  amenities: [
    { name: 'mess', state: 'present', qualifier: '3 meals' },
    { name: 'warden', state: 'present', qualifier: 'on site' },
    { name: 'wifi', state: 'present' },
    { name: 'cctv', state: 'present', qualifier: 'all floors' },
    { name: 'housekeeping', state: 'present', qualifier: 'daily' },
    { name: 'lift', state: 'present' },
    { name: 'drinkingWater', state: 'present', qualifier: 'RO' },
    { name: 'visitors', state: 'present', qualifier: 'ground floor only' },
    { name: 'attachedBath', state: 'absent' },
    { name: 'parking', state: 'absent' },
  ],

  sharingOptions: [
    { id: 'three', label: 'Three sharing', pricePerPerson: 6200, deposit: 6200, depositMonths: 1, bedsLeft: 1, median: true },
    { id: 'four', label: 'Four sharing', pricePerPerson: 5400, deposit: 5400, depositMonths: 1, bedsLeft: 4 },
    { id: 'six', label: 'Six sharing', pricePerPerson: 4500, deposit: 4500, depositMonths: 1, bedsLeft: 0 },
  ],

};

export const vasaviBachelor: Listing = {
  id: 'lst-br-0021',
  category: 'BACHELOR',
  viewCount: 74,
  viewWindow: 'this week',
  name: '1BHK · Vasavi Residency',
  locality: 'Madhapur',
  gender: 'COED',
  photoCount: 9,

  rent: 18000,
  deposit: 36000,
  depositMonths: 2,
  areaMedianDepositMonths: 2,

  availability: { kind: 'UNIT', vacant: true },

  furnishing: 'Semi-furnished',
  noticePeriodDays: 30,
  ownKitchen: true,
  noCurfew: true,

  amenities: [
    { name: 'ac', state: 'present', qualifier: 'bedroom only' },
    { name: 'parking', state: 'present' },
    { name: 'lift', state: 'present' },
    { name: 'powerBackup', state: 'present', qualifier: 'common areas' },
    { name: 'waterSupply', state: 'present', qualifier: '24h' },
    { name: 'cupboard', state: 'present' },
    { name: 'mess', state: 'absent' },
    { name: 'housekeeping', state: 'absent' },
    { name: 'curfew', state: 'absent' },
  ],

  houseRules: [
    { label: 'Entry timing', value: 'No curfew' },
    { label: 'Guests', value: 'Allowed' },
    { label: 'Smoking', value: 'Not allowed indoors' },
    {
      label: 'Notice period',
      value: '30 days',
      glossary: {
        title: 'Notice period',
        body: 'How long before leaving you must tell the owner. Leave sooner and that much rent comes out of your deposit.',
      },
    },
    { label: 'Maintenance', value: '₹1,200 a month, separate' },
  ],
};

export const sriSaiDormitory: Listing = {
  /**
   * Hotels lead with the nightly rate — that is what the category is for — so
   * DAILY is first and preselected. A week and a month still exist, because a
   * student between leases takes a fortnight and should not have to multiply.
   */
  stayRates: [
    { id: 'DAILY', label: 'By the night', unit: 'night', pricePerUnit: 550, daysPerUnit: 1, unitOptions: [1, 2, 3, 5, 7], deposit: 0 },
    { id: 'WEEKLY', label: 'By the week', unit: 'week', pricePerUnit: 3200, daysPerUnit: 7, unitOptions: [1, 2, 3], deposit: 1500 },
    { id: 'MONTHLY', label: 'By the month', unit: 'month', pricePerUnit: 11000, daysPerUnit: 30, unitOptions: [1, 3, 6], deposit: 11000 },
  ],
  // No mess in a hotel — said out loud rather than leaving a gap where the
  // control would be.
  mess: {
    available: false,
    unavailableNote: 'No mess — there are places to eat on the same street.',
  },
  id: 'lst-dm-0007',
  category: 'HOTEL',
  viewCount: 341,
  viewWindow: 'the last 5 days',
  name: 'Sri Sai Dormitory',
  locality: 'Secunderabad',
  localityNote: 'near station',
  gender: 'COED',
  photoCount: 3,

  rent: 300,
  perNight: true,
  monthlyEquivalent: 7500,
  minNights: 3,
  deposit: 0,

  availability: { kind: 'TONIGHT', count: 7 },
  freshness: 'live availability',

  hallSize: '12-bed hall',
  lockers: true,

  amenities: [
    { name: 'cupboard', state: 'present', qualifier: 'lockers' },
    { name: 'hotWater', state: 'present', qualifier: '6 – 10 am' },
    { name: 'cctv', state: 'present' },
    { name: 'drinkingWater', state: 'present' },
    { name: 'wifi', state: 'present', qualifier: 'common area' },
    { name: 'attachedBath', state: 'absent' },
    { name: 'mess', state: 'absent' },
  ],

  sharingOptions: [
    { id: 'hall', label: 'Bed in 12-bed hall', pricePerPerson: 7500, bedsLeft: 7, median: true },
  ],
};

/** The owner has not set a rent. It renders as a sentence, never as ₹0. */
export const unpricedListing: Listing = {
  id: 'lst-pg-0210',
  category: 'PG_HOSTEL',
  viewCount: 96,
  viewWindow: 'the last 24 hours',
  name: 'Anjali Ladies PG',
  locality: 'Kondapur',
  gender: 'GIRLS',
  photoCount: 2,
  rent: null,
  availability: { kind: 'BEDS', count: 2 },
  sharingLabel: '2-sharing',
};

/** Filled while the user was browsing. It dims in place; it is never removed. */
export const filledListing: Listing = {
  id: 'lst-pg-0166',
  category: 'PG_HOSTEL',
  viewCount: 183,
  viewWindow: 'the last 7 days',
  name: 'Kranthi Boys PG',
  locality: 'Gachibowli',
  gender: 'BOYS',
  photoCount: 5,
  rent: 8200,
  deposit: 16400,
  depositMonths: 2,
  availability: { kind: 'FILLED', minutesAgo: 20 },
  meals: {
    included: true,
    mealsPerDay: 2,
    dietary: 'Veg only',
    slots: [{ label: 'Breakfast', window: '7:30 – 9:00 am' }, { label: 'Lunch' }, { label: 'Dinner', window: '8:00 – 10:00 pm' }],
  },
  sharingLabel: '2-sharing',
};

/** A deposit well above the area median — the only case that gets the danger set. */
export const highDepositListing: Listing = {
  id: 'lst-br-0044',
  category: 'BACHELOR',
  viewCount: 57,
  viewWindow: 'the last 3 days',
  name: '2BHK · Green Meadows',
  locality: 'Kukatpally',
  gender: 'COED',
  photoCount: 7,
  rent: 24000,
  deposit: 72000,
  depositMonths: 3,
  areaMedianDepositMonths: 2,
  availability: { kind: 'UNIT', vacant: true },
  furnishing: 'Fully furnished',
  noticePeriodDays: 60,
  ownKitchen: true,
  noCurfew: true,
};

export const listings: readonly Listing[] = [
  saiKrishnaPG,
  lakshmiHostel,
  vasaviBachelor,
  sriSaiDormitory,
];

export const edgeCaseListings: readonly Listing[] = [
  unpricedListing,
  filledListing,
  highDepositListing,
];

/* ------------------------------------------------------------------ *
 * Feed fixtures — enough per category for the home carousels to read
 * as a real market rather than a demo.
 * ------------------------------------------------------------------ */

export const anandPG: Listing = {
  /**
   * Three separate rates, never one divided. A short stay costs more per night
   * because the bed turns over — that is the owner's economics, not a penalty,
   * and showing all three lets a student see the crossover for themselves.
   */
  stayRates: [
    {
      id: 'DAILY',
      label: 'By the day',
      unit: 'day',
      pricePerUnit: 400,
      daysPerUnit: 1,
      unitOptions: [1, 2, 3, 5, 7],
      // No deposit on a stay this short. Shown as zero, never hidden.
      deposit: 0,
    },
    {
      id: 'WEEKLY',
      label: 'By the week',
      unit: 'week',
      pricePerUnit: 2300,
      daysPerUnit: 7,
      unitOptions: [1, 2, 3],
      deposit: 2000,
    },
    {
      id: 'MONTHLY',
      label: 'By the month',
      unit: 'month',
      pricePerUnit: 6000,
      daysPerUnit: 30,
      unitOptions: [1, 3, 6, 11],
      deposit: 12000,
    },
  ],
  mess: {
    available: false,
    unavailableNote: 'No mess here — there is a shared kitchen instead.',
  },
  ownerName: 'Suresh',
  id: 'lst-pg-0301',
  category: 'PG_HOSTEL',
  viewCount: 265,
  viewWindow: 'this week',
  name: 'Anand PG for Boys',
  locality: 'Kukatpally',
  gender: 'BOYS',
  photoCount: 5,
  rent: 9200,
  deposit: 0,
  availability: { kind: 'BEDS', count: 5 },
  sharingLabel: '3-sharing',
};

export const bhavanaGirlsPG: Listing = {
  /**
   * Three separate rates, never one divided. A short stay costs more per night
   * because the bed turns over — that is the owner's economics, not a penalty,
   * and showing all three lets a student see the crossover for themselves.
   */
  stayRates: [
    {
      id: 'DAILY',
      label: 'By the day',
      unit: 'day',
      pricePerUnit: 420,
      daysPerUnit: 1,
      unitOptions: [1, 2, 3, 5, 7],
      // No deposit on a stay this short. Shown as zero, never hidden.
      deposit: 0,
    },
    {
      id: 'WEEKLY',
      label: 'By the week',
      unit: 'week',
      pricePerUnit: 2400,
      daysPerUnit: 7,
      unitOptions: [1, 2, 3],
      deposit: 2000,
    },
    {
      id: 'MONTHLY',
      label: 'By the month',
      unit: 'month',
      pricePerUnit: 8500,
      daysPerUnit: 30,
      unitOptions: [1, 3, 6, 11],
      deposit: 17000,
    },
  ],
  sharingOptions: [
    {
      id: 'two', label: 'Two sharing', pricePerPerson: 11000, deposit: 22000, depositMonths: 2, bedsLeft: 2,
      ratePerUnit: { DAILY: 700, WEEKLY: 4100, MONTHLY: 11000 },
    },
    {
      id: 'three', label: 'Three sharing', pricePerPerson: 8500, deposit: 17000, depositMonths: 2, bedsLeft: 4, median: true,
      ratePerUnit: { DAILY: 550, WEEKLY: 3200, MONTHLY: 8500 },
    },
    {
      id: 'four', label: 'Four sharing', pricePerPerson: 7200, deposit: 14400, depositMonths: 2, bedsLeft: 0,
      ratePerUnit: { DAILY: 480, WEEKLY: 2800, MONTHLY: 7200 },
    },
  ],
  mess: {
    available: true,
    pricePerDay: 150,
    summary: '2 meals a day · veg only · breakfast and dinner',
  },
  ownerName: 'Padma',
  id: 'lst-pg-0402',
  category: 'PG_HOSTEL',
  viewCount: 119,
  viewWindow: 'the last 5 days',
  name: 'Bhavana Girls PG',
  locality: 'Ameerpet',
  gender: 'GIRLS',
  photoCount: 18,
  rent: 8500,
  deposit: 17000,
  depositMonths: 2,
  availability: { kind: 'BEDS', count: 2 },
  sharingLabel: '2-sharing',
};

export const sriVidyaHostel: Listing = {
  /**
   * Three separate rates, never one divided. A short stay costs more per night
   * because the bed turns over — that is the owner's economics, not a penalty,
   * and showing all three lets a student see the crossover for themselves.
   */
  stayRates: [
    {
      id: 'DAILY',
      label: 'By the day',
      unit: 'day',
      pricePerUnit: 360,
      daysPerUnit: 1,
      unitOptions: [1, 2, 3, 5, 7],
      // No deposit on a stay this short. Shown as zero, never hidden.
      deposit: 0,
    },
    {
      id: 'WEEKLY',
      label: 'By the week',
      unit: 'week',
      pricePerUnit: 2100,
      daysPerUnit: 7,
      unitOptions: [1, 2, 3],
      deposit: 2000,
    },
    {
      id: 'MONTHLY',
      label: 'By the month',
      unit: 'month',
      pricePerUnit: 6900,
      daysPerUnit: 30,
      unitOptions: [1, 3, 6, 11],
      deposit: 6900,
    },
  ],
  mess: {
    available: true,
    pricePerDay: 150,
    summary: '2 meals a day · veg only · breakfast and dinner',
  },
  ownerName: 'Lakshmi',
  id: 'lst-hs-0155',
  category: 'PG_HOSTEL',
  viewCount: 88,
  viewWindow: 'the last 24 hours',
  name: 'Sri Vidya Girls Hostel',
  locality: 'Gachibowli',
  gender: 'GIRLS',
  photoCount: 7,
  rent: 6900,
  perBed: true,
  deposit: 6900,
  depositMonths: 1,
  availability: { kind: 'BEDS', count: 2 },
  sharingLabel: '3-sharing',
};

export const balajiBoysHostel: Listing = {
  id: 'lst-hs-0190',
  category: 'PG_HOSTEL',
  viewCount: 301,
  viewWindow: 'the last 7 days',
  name: 'Balaji Boys Hostel',
  locality: 'Dilsukhnagar',
  gender: 'BOYS',
  photoCount: 4,
  rent: 5400,
  perBed: true,
  deposit: 5400,
  depositMonths: 1,
  availability: { kind: 'BEDS', count: 6 },
  sharingLabel: '4-sharing',
};

export const greenParkStudio: Listing = {
  id: 'lst-br-0077',
  category: 'BACHELOR',
  viewCount: 142,
  viewWindow: 'the last 3 days',
  name: 'Studio · Green Park',
  locality: 'Kondapur',
  gender: 'COED',
  photoCount: 6,
  rent: 13500,
  deposit: 27000,
  depositMonths: 2,
  areaMedianDepositMonths: 2,
  availability: { kind: 'UNIT', vacant: true },
  furnishing: 'Fully furnished',
  noticePeriodDays: 30,
};

export const cityNestDorm: Listing = {
  /**
   * Hotels lead with the nightly rate — that is what the category is for — so
   * DAILY is first and preselected. A week and a month still exist, because a
   * student between leases takes a fortnight and should not have to multiply.
   */
  stayRates: [
    { id: 'DAILY', label: 'By the night', unit: 'night', pricePerUnit: 550, daysPerUnit: 1, unitOptions: [1, 2, 3, 5, 7], deposit: 0 },
    { id: 'WEEKLY', label: 'By the week', unit: 'week', pricePerUnit: 3200, daysPerUnit: 7, unitOptions: [1, 2, 3], deposit: 1500 },
    { id: 'MONTHLY', label: 'By the month', unit: 'month', pricePerUnit: 11000, daysPerUnit: 30, unitOptions: [1, 3, 6], deposit: 11000 },
  ],
  // No mess in a hotel — said out loud rather than leaving a gap where the
  // control would be.
  mess: {
    available: false,
    unavailableNote: 'No mess — there are places to eat on the same street.',
  },
  id: 'lst-dm-0044',
  category: 'HOTEL',
  viewCount: 77,
  viewWindow: 'this week',
  name: 'City Nest Dormitory',
  locality: 'Ameerpet',
  gender: 'COED',
  photoCount: 4,
  rent: 250,
  perNight: true,
  monthlyEquivalent: 6500,
  minNights: 2,
  deposit: 0,
  availability: { kind: 'TONIGHT', count: 12 },
  hallSize: '10-bed hall',
};

/** Everything the feed draws from. */
/* ------------------------------------------------------------------ *
 * House / Co-live
 * ------------------------------------------------------------------ */

/**
 * Co-live sits between a bachelor unit and a PG: your own lockable room, but
 * the kitchen, living room and bills are shared with people you did not choose.
 *
 * It keeps the sharing selector rather than the stay-length block, because the
 * decision here is *which room*, not *how long* — these are twelve-month leases
 * and the rooms differ in price.
 */
export const kohinoorCoLive: Listing = {
  id: 'lst-hc-0210',
  category: 'COLIVE',
  viewCount: 166,
  viewWindow: 'the last 5 days',
  name: 'Kohinoor Co-Living',
  locality: 'Gachibowli',
  localityNote: 'behind the DLF block',
  landmark: 'Next to Sarath City mall gate 3',
  ownerName: 'Nikhil',
  gender: 'COED',
  photoCount: 14,
  rent: 15500,
  deposit: 31000,
  depositMonths: 2,
  areaMedianDepositMonths: 2,
  availability: { kind: 'BEDS', count: 3 },
  furnishing: 'Fully furnished',
  noticePeriodDays: 30,
  sharingOptions: [
    {
      id: 'private',
      label: 'Private room',
      pricePerPerson: 18500,
      deposit: 37000,
      depositMonths: 2,
      bedsLeft: 1,
    },
    {
      id: 'twin',
      label: 'Twin sharing',
      pricePerPerson: 15500,
      deposit: 31000,
      depositMonths: 2,
      bedsLeft: 2,
      median: true,
    },
  ],
  amenities: [
    { name: 'wifi', state: 'present', qualifier: '100 Mbps' },
    { name: 'housekeeping', state: 'present', qualifier: 'twice a week' },
    { name: 'ac', state: 'present' },
    { name: 'laundry', state: 'present', qualifier: 'in-house' },
    { name: 'powerBackup', state: 'present', qualifier: '24h' },
    { name: 'tv', state: 'present' },
    { name: 'gym', state: 'present' },
    { name: 'parking', state: 'present' },
    { name: 'mess', state: 'absent' },
    { name: 'curfew', state: 'absent' },
  ],
};

export const alphaHouseShare: Listing = {
  id: 'lst-hc-0211',
  category: 'COLIVE',
  viewCount: 204,
  viewWindow: 'the last 24 hours',
  name: 'Alpha House Share',
  locality: 'Madhapur',
  ownerName: 'Reshma',
  gender: 'GIRLS',
  photoCount: 9,
  rent: 12000,
  deposit: 24000,
  depositMonths: 2,
  availability: { kind: 'BEDS', count: 1 },
  furnishing: 'Semi-furnished',
  noticePeriodDays: 30,
  amenities: [
    { name: 'wifi', state: 'present', qualifier: '75 Mbps' },
    { name: 'housekeeping', state: 'present', qualifier: 'weekly' },
    { name: 'ac', state: 'present', qualifier: 'bedroom only' },
    { name: 'powerBackup', state: 'present' },
    { name: 'mess', state: 'absent' },
  ],
};

export const feedListings: readonly Listing[] = [
  saiKrishnaPG,
  bhavanaGirlsPG,
  anandPG,
  unpricedListing,
  lakshmiHostel,
  sriVidyaHostel,
  balajiBoysHostel,
  vasaviBachelor,
  greenParkStudio,
  highDepositListing,
  kohinoorCoLive,
  alphaHouseShare,
  sriSaiDormitory,
  cityNestDorm,
];

/** Everything the app can resolve by id, including the ones not in the feed. */
export const allListings: readonly Listing[] = [...feedListings, ...edgeCaseListings];

export function findListing(id: string): Listing | undefined {
  return allListings.find((listing) => listing.id === id);
}

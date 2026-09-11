export const MEAL_TIMING_PLACEHOLDERS = {
  Breakfast: 'e.g. 7:30 AM - 9:30 AM',
  Lunch: 'e.g. 12:30 PM - 2:30 PM',
  Dinner: 'e.g. 8:00 PM - 10:00 PM'
};

export const DEPENDENT_MAPS = {
  sharingTypes: [
    'sharingPrices', 'sharingAC', 'sharingAcPrices', 'sharingRooms', 'sharingBeds',
    'localSharingImages', 'sharingImages',
  ],
  mealsProvided: ['mealTimings']
};

export const CATEGORY_LABEL = {
  PG_HOSTEL: 'PG / Hostel',
  BACHELOR: 'Bachelor',
  HOTEL: 'Hotels',
  COLIVE: 'House / Co-live',
  COMMERCIAL: 'Shop / Commercial',
};

export const CATEGORY_BADGE = {
  PG_HOSTEL: 'badge-pg',
  BACHELOR: 'badge-bachelor',
  HOTEL: 'badge-dormitory',
  COLIVE: 'badge-bachelor',
  /* Reusing the dormitory badge rather than minting a fifth colour. The badge
     set is a palette, not a taxonomy, and a new colour here would have to be
     added to the stylesheet, the listing card and the admin console before it
     stopped looking like a bug on three screens. */
  COMMERCIAL: 'badge-dormitory',
};

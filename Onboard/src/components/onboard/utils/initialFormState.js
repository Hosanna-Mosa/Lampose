export const INITIAL_FORM_STATE = {
  name: '',
  place: '',
  ownerName: '',
  ownerMobile: '',
  // Optional second number. Blank is a valid answer and is stored as blank.
  ownerAltMobile: '',
  category: 'PG_HOSTEL',
  employeeEmail: '',
  stayType: 'Long Stay',
  shortStayDuration: '1-7 Days',
  dailyPrice: '',
  longStayDuration: '1 Month+',
  monthlyPrice: '',
  rent: '',
  deposit: '',
  // What the owner agreed to pay Lampose per successful booking. Blank saves as 0.
  agreedSuccessCharge: '',
  address: '',
  /* The pin, as `{lat, lng}`, when the crosshair took one — null otherwise.
     There is no `mapLink` here on purpose: a pasted link lives in `address`
     while it is being typed and is lifted out of it at submit, so the box on
     screen and the field behind it cannot disagree. See services/mapLink.js. */
  location: null,
  imageUrl: '',
  images: [],
  localImages: [],
  amenities: ['WiFi', 'AC', 'Food', 'RO Water'],
  categoryDetails: {
    foodIncluded: true,
    foodType: 'Both (Veg & Non-Veg)',
    mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
    mealTimings: {
      Breakfast: '7:30 AM - 9:30 AM',
      Lunch: '12:30 PM - 2:30 PM',
      Dinner: '8:00 PM - 10:00 PM'
    },
    sharingTypes: ['Single', '2 Sharing'],
    /* Occupancies added through "Custom" in CategoryFieldsStep. Only the
       extras are recorded here — the five standard options are a constant in
       that file, not data. */
    customSharingTypes: [],
    sharingPrices: {},
    /* Beds entered directly per sharing option — the claimable count the
       request flow decrements. */
    sharingBeds: {},
    sharingAC: {},
    sharingAcPrices: {},
    curfewTime: '10:30 PM',
    housekeeping: true,
    /* Kept in step with handleCategorySelect('PG_HOSTEL') below — that
       function only runs when an agent explicitly SWITCHES to this category,
       but PG_HOSTEL is also the category the form opens on by default, which
       never calls it. Without these five here too, a fresh form's Hostel Type
       dropdown shows "Boys Hostel" selected (its own `|| 'Boys Hostel'`
       fallback) while categoryDetails.hostelType is actually empty — so
       submit fails on a required field that already looks filled in, and
       nothing on screen shows what to fix. Switching category away and back
       used to be the only way to actually write the default into state. */
    hostelType: 'Boys Hostel',
    canteenFacility: true,
    wardenContact: '',
    securityCCTV: true,
    studyRoom: true
  }
};

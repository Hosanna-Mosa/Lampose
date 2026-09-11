export const MEAL_OPTIONS = ['Breakfast', 'Lunch', 'Dinner'];

export const BASE_SHARING_TYPES = ['Single', '2 Sharing', '3 Sharing', '4 Sharing'];

export const BED_TYPES = ['Single', 'Double', '3 Sharing', '4 Sharing'];

export const PREMISES_DOC_TYPES = [
  'Trade / Shop & Establishment Licence',
  'GST Registration Certificate',
  'Property Tax Receipt',
  'Electricity Bill (in the business name)',
  'Registered Lease or Rent Agreement',
  'Fire Safety NOC',
  'Municipal / Panchayat Permission',
];

export const RATE_STRUCTURES = [
  { id: 'nightly', label: 'Per night', base: 'sharingPrices', ac: 'sharingAcPrices', required: true, hint: 'e.g. 450' },
  { id: 'monthly', label: 'Per month', base: 'monthlyPrices', ac: 'monthlyAcPrices', required: false, hint: 'e.g. 9000' },
  { id: 'flexible', label: 'Flexible / hourly', base: 'flexiblePrices', ac: 'flexibleAcPrices', required: false, hint: 'e.g. 150' },
];

export const ROOM_LAYOUTS = [
  { id: 'Single Private Room', label: 'Single Private Room' },
  { id: '1 RK', label: '1 RK (Room Kitchen)' },
  { id: '1 BHK', label: '1 BHK Apartment' },
  { id: '2 BHK', label: '2 BHK Apartment' },
  { id: '3 BHK', label: '3 BHK Apartment' },
];

export const FURNISHING_ITEMS = {
  'Fully Furnished': [
    'Bed', 'Mattress', 'Sofa', 'Wardrobe', 'Table', 'Chairs', 'TV',
    'Refrigerator', 'Washing Machine', 'AC', 'Fan', 'Geyser', 'Water Purifier',
    'Kitchen Setup', 'Gas Stove', 'Dining Table', 'Curtains', 'Wi-Fi',
    'Balcony Furniture',
  ],
  'Semi-Furnished': [
    'Wardrobe', 'Bed', 'Fan', 'Light Fixtures', 'Geyser', 'AC',
    'Kitchen Cabinets', 'Modular Kitchen', 'Exhaust Fan', 'Curtains',
    'Dining/Counter Area', 'Water Purifier',
  ],
};

export const TENANT_OPTIONS = {
  BACHELOR: [
    { id: 'Bachelors Male Only', label: 'Bachelors Male Only' },
    { id: 'Bachelors Female Only', label: 'Bachelors Female Only' },
  ],
  COLIVE: [
    { id: 'Bachelors Male / Female', label: 'Male / Female (mixed)' },
    { id: 'Bachelors Male Only', label: 'Male Only' },
    { id: 'Bachelors Female Only', label: 'Female Only' },
    { id: 'Family', label: 'Family' },
  ],
};

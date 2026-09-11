export const OCCUPANCY_KEY = {
  /* Two for PG_HOSTEL: the merge joined a category that wrote `sharingTypes`
     to one that wrote `roomTypes`, and both are live in the collection. */
  PG_HOSTEL: ['sharingTypes', 'roomTypes'],
  HOTEL: ['bedTypes', 'bedType'],
  /* Plural since layouts became multi-select; the singular is what older
     rows carry. */
  BACHELOR: ['roomTypes', 'roomType'],
  COLIVE: ['roomTypes', 'roomType'],
};

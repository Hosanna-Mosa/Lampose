export const SORTS = [
  { id: 'recent', label: 'Recently listed' },
  { id: 'price-asc', label: 'Rent: low to high' },
  { id: 'price-desc', label: 'Rent: high to low' },
  { id: 'name', label: 'Name: A to Z' },
];

export const PAGE = 12;

export const EMPTY_FILTERS = {
  q: '',
  category: 'all',
  city: 'all',
  stay: 'all',
  amenities: [],
  maxPrice: null,        // null = no ceiling, so it follows the data
};

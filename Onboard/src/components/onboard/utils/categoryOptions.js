import { BedDouble, Building2, Home, Store, Users } from 'lucide-react';

export const CATEGORY_OPTIONS = [
  {
    id: 'PG_HOSTEL',
    title: 'PG / Hostel',
    subtitle: 'Sharing rooms, meals, warden or canteen — student and worker stays',
    badge: 'Popular',
    icon: Building2
  },
  {
    id: 'BACHELOR',
    title: 'Bachelor Room / Flat',
    subtitle: '1BHK/2BHK flat or room for male/female bachelors',
    badge: 'Private',
    icon: Users
  },
  {
    id: 'HOTEL',
    title: 'Hotel / Dormitory',
    subtitle: 'Bunk beds or rooms, nightly rates, lockers & shared bath',
    badge: 'By the night',
    icon: BedDouble
  },
  {
    id: 'COLIVE',
    title: 'House / Co-live',
    subtitle: 'A whole house or a room in one, shared with other tenants',
    badge: 'Shared',
    icon: Home
  },
  /*
   * The one option on this screen nobody sleeps in.
   *
   * Last deliberately. An agent onboarding a stay should reach the four they
   * came for before they reach this one, and the badge says outright what it
   * is so a shop cannot be picked by a misread of "House".
   */
  {
    id: 'COMMERCIAL',
    title: 'Shop / Commercial Space',
    subtitle: 'Shop, office, godown or restaurant space — let by the month, not lived in',
    badge: 'Commercial',
    icon: Store
  }
];

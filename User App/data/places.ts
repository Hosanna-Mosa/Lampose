import type { Locality } from '@/types/auth';

/**
 * Localities.
 *
 * Every row carries its listing count and median rent because the decision
 * "which area can I afford?" is made on the location screen, not two screens
 * later. Localities with nothing listed stay in the list, greyed — hiding them
 * would leave a student wondering whether they typed the name wrong.
 *
 * The popular ordering is by listing volume, not by what we would like to sell.
 */

export const localities: readonly Locality[] = [
  {
    id: 'loc-gachibowli',
    name: 'Gachibowli',
    city: 'Hyderabad',
    listingCount: 184,
    medianRent: 8500,
    nearestLandmark: 'IIIT-Hyderabad',
    aliases: ['gachibowly', 'gachhibowli', 'iiit', 'iiit-h', 'triple it'],
  },
  {
    id: 'loc-madhapur',
    name: 'Madhapur',
    city: 'Hyderabad',
    listingCount: 152,
    medianRent: 11000,
    nearestLandmark: 'Hitec City metro',
    aliases: ['madapur', 'hitech city', 'hitec city', 'mindspace'],
  },
  {
    id: 'loc-ameerpet',
    name: 'Ameerpet',
    city: 'Hyderabad',
    listingCount: 143,
    medianRent: 6200,
    nearestLandmark: 'Ameerpet metro',
    aliases: ['amerpet', 'ameerpet metro', 'coaching hub', 'chaitanya'],
  },
  {
    id: 'loc-kukatpally',
    name: 'Kukatpally',
    city: 'Hyderabad',
    listingCount: 121,
    medianRent: 7400,
    nearestLandmark: 'JNTU Hyderabad',
    aliases: ['kukat pally', 'kphb', 'jntu'],
  },
  {
    id: 'loc-kondapur',
    name: 'Kondapur',
    city: 'Hyderabad',
    listingCount: 96,
    medianRent: 9200,
    nearestLandmark: 'Botanical Garden',
    aliases: ['kondapoor'],
  },
  {
    id: 'loc-secunderabad',
    name: 'Secunderabad',
    city: 'Hyderabad',
    listingCount: 74,
    medianRent: 6800,
    nearestLandmark: 'Secunderabad station',
    aliases: ['sec bad', 'secunderbad', 'railway station'],
  },
  {
    id: 'loc-dilsukhnagar',
    name: 'Dilsukhnagar',
    city: 'Hyderabad',
    listingCount: 58,
    medianRent: 5600,
    nearestLandmark: 'Dilsukhnagar bus stand',
    aliases: ['dilshuknagar', 'dsnr'],
  },
  {
    id: 'loc-narsingi',
    name: 'Narsingi',
    city: 'Hyderabad',
    listingCount: 0,
    medianRent: null,
    nearestLandmark: 'ORR exit 19',
    aliases: ['narsingii'],
  },
];

/** What the GPS guess resolves to, in the mock. Always shown as a guess. */
export const currentLocationGuess = localities[0];

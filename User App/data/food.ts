/**
 * The Food catalogue — mock, and deliberately so.
 *
 * There is no food module on the backend yet (`Backend/src/modules/` has no
 * `food` folder), so this file stands in for it. It is shaped like the API that
 * will replace it: kitchens and dishes are indexed by meal window, prices are
 * whole rupees, and nothing is derived at import time from the clock — every
 * time-dependent value is computed at render against a `Date` the caller
 * passes in, so a screen left open across 3:30 pm updates instead of lying.
 *
 * Areas are absent on purpose. A kitchen carries a street, and the feed pairs
 * it with the locality the student chose on the entry screen — see the note on
 * `Kitchen.landmark`.
 */

import type { Coupon, Dish, FoodAddress, FoodOrder, Kitchen, MealWindowId } from '@/types/food';

/* ------------------------------------------------------------------ *
 * Photos
 * ------------------------------------------------------------------ */

/**
 * Mock photography, keyed by the id it belongs to.
 *
 * These are Wikimedia Commons files, chosen one at a time so the picture
 * actually matches the dish — a stock bowl of noodles under "Ghee podi idli"
 * is worse than no photo at all, because it teaches a student that the images
 * are decoration and the words are the only thing to read.
 *
 * THEY ARE PLACEHOLDERS AND MUST NOT SHIP. Two reasons, either of which is
 * enough: Wikimedia asks not to be used as a CDN by applications, and Commons
 * files carry per-file licences that would each need attribution. They are
 * here so the module can be reviewed with real food in it; the real ones come
 * from the same onboarding pass that collects a kitchen's menu, and swapping
 * them is editing these two maps.
 *
 * A missing or failing URL is not a bug — `FoodPhoto` keeps its striped well
 * underneath and the layout does not move.
 */
const DISH_PHOTOS: Record<string, string | undefined> = {
  'aloo-paratha':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Aloo_Paratha_%2896238%29.jpg/960px-Aloo_Paratha_%2896238%29.jpg',
  'bombay-sandwich':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Bombay_cheese_sandwich.jpg/960px-Bombay_cheese_sandwich.jpg',
  'cheese-maggi':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Vegetable_Maggi_3.jpg/960px-Vegetable_Maggi_3.jpg',
  'chicken-65':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Chicken_65_%28Dish%29.jpg/960px-Chicken_65_%28Dish%29.jpg',
  'chicken-biryani':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Chicken_biryani_02-06-2015_%28India%29.jpg/960px-Chicken_biryani_02-06-2015_%28India%29.jpg',
  'curd-rice':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Curd_rice_in_ICH_Bhopal.jpg/960px-Curd_rice_in_ICH_Bhopal.jpg',
  'dal-fry':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Dal_Fry_Recipe_In_Dhaba_Style_From_Indian_Cuisine_By_Sonia_Goyal.jpg/960px-Dal_Fry_Recipe_In_Dhaba_Style_From_Indian_Cuisine_By_Sonia_Goyal.jpg',
  'egg-biryani':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Egg_Biryani_in_a_restaurant.jpg/960px-Egg_Biryani_in_a_restaurant.jpg',
  'egg-curry-rice':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Spicy_Anda_Curry.jpg/960px-Spicy_Anda_Curry.jpg',
  'egg-dosa':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Egg_Dosa-MB42.jpg/960px-Egg_Dosa-MB42.jpg',
  'filter-coffee':
    'https://upload.wikimedia.org/wikipedia/commons/8/84/Indian_filter_coffee_in_Dabarah.jpg',
  'idli-plate':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Idli_Sambar-Noida-UP-SP004.jpg/960px-Idli_Sambar-Noida-UP-SP004.jpg',
  'masala-chai':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Masala_Chai.jpg/960px-Masala_Chai.jpg',
  'masala-dosa':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Masala_dosa_01.jpg/960px-Masala_dosa_01.jpg',
  'masala-omelette':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Masala_omelette.JPG/960px-Masala_omelette.JPG',
  'mirchi-bajji':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Stuffed_mirchi_bajji_%2816164286908%29.jpg/960px-Stuffed_mirchi_bajji_%2816164286908%29.jpg',
  'paneer-paratha':
    'https://upload.wikimedia.org/wikipedia/commons/3/3f/Awadhi_palak_paneer_paratha_dahi.jpg',
  'paneer-thali':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Paneer_butter_masala_2.jpg/960px-Paneer_butter_masala_2.jpg',
  'pav-bhaji':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Pav_bhaji_SWW.jpg/960px-Pav_bhaji_SWW.jpg',
  'podi-idli':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Podi_Idli_-_Mini_Idli_dipped_in_Podi.jpg/960px-Podi_Idli_-_Mini_Idli_dipped_in_Podi.jpg',
  'poori':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Poori_Sagu_Karnataka_Kannada_%E0%B2%AA%E0%B3%82%E0%B2%B0%E0%B2%BF_%E0%B2%B8%E0%B2%BE%E0%B2%97%E0%B3%81_%E0%B2%95%E0%B2%A8%E0%B3%8D%E0%B2%A8%E0%B2%A1.jpg/960px-Poori_Sagu_Karnataka_Kannada_%E0%B2%AA%E0%B3%82%E0%B2%B0%E0%B2%BF_%E0%B2%B8%E0%B2%BE%E0%B2%97%E0%B3%81_%E0%B2%95%E0%B2%A8%E0%B3%8D%E0%B2%A8%E0%B2%A1.jpg',
  'veg-biryani':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Vegetable_Biryani_IMG_001.jpg/960px-Vegetable_Biryani_IMG_001.jpg',
  'veg-thali':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/South_Indian_thali-Saravana_bhawan-New_Delhi-6.jpg/960px-South_Indian_thali-Saravana_bhawan-New_Delhi-6.jpg',
};

const KITCHEN_PHOTOS: Record<string, string | undefined> = {
  'annapurna':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/South_indian_meals_24.jpg/960px-South_indian_meals_24.jpg',
  'bawarchi':
    'https://upload.wikimedia.org/wikipedia/commons/c/c3/Handi_cox%27s_bazar_hyderabad_biryani.jpg',
  'mumbai':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Ragda_pattice.JPG/960px-Ragda_pattice.JPG',
  'nightowl':
    'https://upload.wikimedia.org/wikipedia/commons/a/a6/Tea_stall_in_Pushkar.jpg',
  'paratha':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Lachha_Tawa_Paratha_-_The_Indismart_Hotel_-_Salt_Lake_City_-_Kolkata_2023-08-13_3318.jpg/960px-Lachha_Tawa_Paratha_-_The_Indismart_Hotel_-_Salt_Lake_City_-_Kolkata_2023-08-13_3318.jpg',
  'srisai':
    'https://upload.wikimedia.org/wikipedia/commons/d/d6/Aloo_samosa_-_Sri_Sai_tiffin_centre%2C_Gulmohar_Park_Colony%2C_Serilingampalle_-_Hyderabad_-_DSC_0018.jpg',
};

/* ------------------------------------------------------------------ *
 * Kitchens
 * ------------------------------------------------------------------ */

/**
 * Photos are attached by id rather than written on each row, so a kitchen and
 * its picture cannot drift apart in a copy-paste and the whole set can be
 * swapped by replacing one map.
 */
export const KITCHENS: readonly Kitchen[] = ([
  {
    id: 'annapurna',
    name: 'Annapurna Mess',
    cuisine: 'South Indian, thali',
    landmark: 'DLF Circle Road',
    walkMinutes: 9,
    rating: 4.4,
    ratingCount: 1240,
    windows: ['breakfast', 'lunch', 'dinner'],
    deliveryFee: 9,
    minOrder: 80,
    prepMinutes: 9,
    deliveryMinutes: 22,
    sections: ['Thalis', 'Curries', 'Rice', 'Drinks'],
    directions:
      'Out of the PG gate, left on DLF Circle Road for 600 m. The mess counter is beside the Ratnadeep entrance, ground floor.',
  },
  {
    id: 'srisai',
    name: 'Sri Sai Tiffins',
    cuisine: 'South Indian, tiffins',
    landmark: 'Indira Nagar Road',
    walkMinutes: 6,
    rating: 4.5,
    ratingCount: 860,
    windows: ['breakfast', 'snacks'],
    deliveryFee: 9,
    minOrder: 60,
    prepMinutes: 12,
    deliveryMinutes: 18,
    sections: ['Tiffins', 'Dosas', 'Drinks'],
    directions: 'First lane past the bus stop, blue shutter beside the xerox shop.',
  },
  {
    id: 'bawarchi',
    name: 'Bawarchi Express',
    cuisine: 'Biryani, Andhra',
    landmark: 'Satyam Theatre Lane',
    walkMinutes: 11,
    rating: 4.3,
    ratingCount: 2110,
    windows: ['lunch', 'dinner'],
    deliveryFee: 12,
    minOrder: 80,
    prepMinutes: 16,
    deliveryMinutes: 26,
    sections: ['Biryani', 'Starters', 'Breads'],
    noOffers: true,
    directions: 'Ground floor of the Satyam lane arcade, counter faces the road.',
  },
  {
    id: 'mumbai',
    name: 'Mumbai Bites',
    cuisine: 'Street food, sandwiches',
    landmark: 'Market Road',
    walkMinutes: 3,
    rating: 4.1,
    ratingCount: 540,
    windows: ['breakfast', 'snacks', 'lateNight'],
    deliveryFee: 9,
    minOrder: 50,
    prepMinutes: 8,
    deliveryMinutes: 14,
    sections: ['Sandwiches', 'Chaat', 'Fried'],
  },
  {
    id: 'nightowl',
    name: 'Night Owl Maggi Point',
    cuisine: 'Maggi, omelette, chai',
    landmark: 'Behind the college gate',
    walkMinutes: 2,
    rating: 4.2,
    ratingCount: 390,
    windows: ['lateNight', 'snacks'],
    deliveryFee: 0,
    minOrder: 40,
    prepMinutes: 7,
    deliveryMinutes: 12,
    sections: ['Maggi', 'Eggs', 'Chai'],
    directions: 'The cart beside the college wall. Ask for the LAMPOSE counter.',
  },
  {
    id: 'paratha',
    name: 'Paratha Junction',
    cuisine: 'North Indian, parathas',
    landmark: 'Botanical Garden Road',
    walkMinutes: 8,
    rating: 4.4,
    ratingCount: 720,
    windows: ['breakfast', 'dinner', 'lateNight'],
    deliveryFee: 12,
    minOrder: 70,
    prepMinutes: 11,
    deliveryMinutes: 20,
    sections: ['Parathas', 'Curries', 'Drinks'],
  },
] as const).map((kitchen) => ({ ...kitchen, photo: KITCHEN_PHOTOS[kitchen.id] }));

export function findKitchen(id: string): Kitchen | undefined {
  return KITCHENS.find((kitchen) => kitchen.id === id);
}

export function kitchenOpen(kitchen: Kitchen, window: MealWindowId): boolean {
  return kitchen.windows.includes(window);
}

/* ------------------------------------------------------------------ *
 * Dishes
 * ------------------------------------------------------------------ */

const CURD: { id: string; label: string; price: number } = { id: 'curd', label: 'Extra curd', price: 15 };
const GHEE = { id: 'ghee', label: 'Ghee spoon', price: 10 };
const PAPAD = { id: 'papad', label: 'Papad, 2 pc', price: 8 };

export const DISHES: readonly Dish[] = ([
  /* Annapurna Mess */
  {
    id: 'veg-thali',
    kitchenId: 'annapurna',
    name: 'Unlimited veg thali',
    description: 'Rice, sambar, rasam, two seasonal curries, curd and pickle. Refills of rice and sambar are free.',
    price: 95,
    diet: 'veg',
    section: 'Thalis',
    windows: ['lunch', 'dinner'],
    addOns: [CURD, GHEE, PAPAD],
    serves: 'Serves 1, about 350 g',
    rating: 4.4,
    ratingCount: 312,
    ordersInBlock: 41,
  },
  {
    id: 'paneer-thali',
    kitchenId: 'annapurna',
    name: 'Paneer butter masala thali',
    description: 'Four rotis, paneer butter masala, jeera rice and salad.',
    price: 130,
    diet: 'veg',
    section: 'Thalis',
    windows: ['lunch', 'dinner'],
    addOns: [GHEE, PAPAD],
    serves: 'Serves 1, about 400 g',
    rating: 4.3,
    ratingCount: 188,
  },
  {
    id: 'egg-curry-rice',
    kitchenId: 'annapurna',
    name: 'Egg curry rice',
    description: 'Two eggs in Andhra gravy over steamed rice.',
    price: 110,
    diet: 'egg',
    section: 'Curries',
    windows: ['lunch', 'dinner'],
    serves: 'Serves 1',
    rating: 4.2,
    ratingCount: 96,
  },
  {
    id: 'curd-rice',
    kitchenId: 'annapurna',
    name: 'Curd rice with pickle',
    description: 'Cooled rice, set curd, curry-leaf tempering, avakaya on the side.',
    price: 60,
    diet: 'veg',
    section: 'Rice',
    windows: ['lunch', 'dinner'],
    rating: 4.0,
    ratingCount: 74,
  },
  {
    id: 'filter-coffee',
    kitchenId: 'annapurna',
    name: 'Filter coffee',
    description: 'Degree coffee, made to order. Comes in a steel tumbler for pickup.',
    price: 25,
    diet: 'veg',
    section: 'Drinks',
    windows: ['breakfast', 'lunch', 'dinner'],
    rating: 4.6,
    ratingCount: 410,
    spiceFixed: true,
  },
  {
    id: 'idli-plate',
    kitchenId: 'annapurna',
    name: 'Idli, 3 pc',
    description: 'Steamed idli with sambar and two chutneys.',
    price: 55,
    diet: 'veg',
    section: 'Thalis',
    windows: ['breakfast'],
    rating: 4.3,
    ratingCount: 205,
  },

  /* Sri Sai Tiffins */
  {
    id: 'podi-idli',
    kitchenId: 'srisai',
    name: 'Ghee podi idli',
    description: 'Mini idli tossed in idli podi and ghee, served with coconut chutney.',
    price: 70,
    diet: 'veg',
    section: 'Tiffins',
    windows: ['breakfast', 'snacks'],
    serves: 'Serves 1, 8 pieces',
    rating: 4.5,
    ratingCount: 268,
    ordersInBlock: 34,
  },
  {
    id: 'egg-dosa',
    kitchenId: 'srisai',
    name: 'Egg dosa',
    description: 'Thin dosa with an egg spread over it, onion and green chilli.',
    price: 85,
    diet: 'egg',
    section: 'Dosas',
    windows: ['breakfast', 'snacks'],
    rating: 4.2,
    ratingCount: 151,
    ordersInBlock: 21,
  },
  {
    id: 'poori',
    kitchenId: 'srisai',
    name: 'Poori, 2 pc',
    description: 'Two pooris with potato masala.',
    price: 55,
    diet: 'veg',
    section: 'Tiffins',
    windows: ['breakfast'],
    rating: 4.1,
    ratingCount: 88,
  },
  {
    id: 'masala-dosa',
    kitchenId: 'srisai',
    name: 'Masala dosa',
    description: 'Crisp dosa, potato masala, sambar and chutney.',
    price: 80,
    diet: 'veg',
    section: 'Dosas',
    windows: ['breakfast', 'snacks'],
    rating: 4.4,
    ratingCount: 233,
  },

  /* Bawarchi Express */
  {
    id: 'chicken-biryani',
    kitchenId: 'bawarchi',
    name: 'Chicken 65 biryani',
    description: 'Single-portion dum biryani with fried chicken 65 and raita.',
    price: 160,
    diet: 'nonveg',
    section: 'Biryani',
    windows: ['lunch', 'dinner'],
    serves: 'Serves 1, about 500 g',
    rating: 4.3,
    ratingCount: 640,
  },
  {
    id: 'veg-biryani',
    kitchenId: 'bawarchi',
    name: 'Veg dum biryani',
    description: 'Basmati with mixed vegetables, mint and fried onion.',
    price: 120,
    diet: 'veg',
    section: 'Biryani',
    windows: ['lunch', 'dinner'],
    rating: 4.1,
    ratingCount: 302,
  },
  {
    id: 'chicken-65',
    kitchenId: 'bawarchi',
    name: 'Chicken 65, 6 pc',
    description: 'Boneless, curry leaf and green chilli tempering.',
    price: 150,
    diet: 'nonveg',
    section: 'Starters',
    windows: ['lunch', 'dinner'],
    rating: 4.4,
    ratingCount: 411,
  },
  {
    id: 'egg-biryani',
    kitchenId: 'bawarchi',
    name: 'Egg biryani',
    description: 'Dum biryani with two boiled eggs and salan.',
    price: 135,
    diet: 'egg',
    section: 'Biryani',
    windows: ['lunch', 'dinner'],
    soldOut: true,
    rating: 4.0,
    ratingCount: 122,
  },

  /* Mumbai Bites */
  {
    id: 'bombay-sandwich',
    kitchenId: 'mumbai',
    name: 'Bombay sandwich',
    description: 'Three layers, chutney, beetroot and potato, grilled with butter.',
    price: 80,
    diet: 'veg',
    section: 'Sandwiches',
    windows: ['breakfast', 'snacks', 'lateNight'],
    rating: 4.1,
    ratingCount: 176,
  },
  {
    id: 'mirchi-bajji',
    kitchenId: 'mumbai',
    name: 'Mirchi bajji, 4 pc',
    description: 'Stuffed chillies in besan batter, onion and lime on the side.',
    price: 45,
    diet: 'veg',
    section: 'Fried',
    windows: ['snacks', 'lateNight'],
    rating: 4.2,
    ratingCount: 130,
  },
  {
    id: 'pav-bhaji',
    kitchenId: 'mumbai',
    name: 'Pav bhaji',
    description: 'Butter bhaji with two pav, onion and lime.',
    price: 90,
    diet: 'veg',
    section: 'Chaat',
    windows: ['snacks', 'lateNight'],
    rating: 4.3,
    ratingCount: 210,
  },

  /* Night Owl Maggi Point */
  {
    id: 'cheese-maggi',
    kitchenId: 'nightowl',
    name: 'Cheese maggi',
    description: 'Maggi with a cheese slice folded through it, onion and coriander.',
    price: 60,
    diet: 'veg',
    section: 'Maggi',
    windows: ['snacks', 'lateNight'],
    rating: 4.2,
    ratingCount: 260,
    ordersInBlock: 52,
  },
  {
    id: 'masala-omelette',
    kitchenId: 'nightowl',
    name: 'Masala omelette, 2 egg',
    description: 'Two eggs, onion, chilli, served with bread.',
    price: 55,
    diet: 'egg',
    section: 'Eggs',
    windows: ['lateNight', 'snacks'],
    rating: 4.1,
    ratingCount: 143,
  },
  {
    id: 'masala-chai',
    kitchenId: 'nightowl',
    name: 'Masala chai',
    description: 'Boiled long, ginger and cardamom.',
    price: 20,
    diet: 'veg',
    section: 'Chai',
    windows: ['snacks', 'lateNight'],
    rating: 4.5,
    ratingCount: 512,
    spiceFixed: true,
  },

  /* Paratha Junction */
  {
    id: 'aloo-paratha',
    kitchenId: 'paratha',
    name: 'Aloo paratha, 2 pc',
    description: 'Two stuffed parathas with curd and pickle.',
    price: 75,
    diet: 'veg',
    section: 'Parathas',
    windows: ['breakfast', 'dinner', 'lateNight'],
    rating: 4.4,
    ratingCount: 298,
  },
  {
    id: 'paneer-paratha',
    kitchenId: 'paratha',
    name: 'Paneer paratha',
    description: 'Single paratha stuffed with spiced paneer, butter on top.',
    price: 95,
    diet: 'veg',
    section: 'Parathas',
    windows: ['dinner', 'lateNight'],
    rating: 4.3,
    ratingCount: 164,
  },
  {
    id: 'dal-fry',
    kitchenId: 'paratha',
    name: 'Dal fry with rice',
    description: 'Yellow dal tempered with ghee and jeera, over steamed rice.',
    price: 105,
    diet: 'veg',
    section: 'Curries',
    windows: ['dinner'],
    rating: 4.2,
    ratingCount: 119,
  },
] as const).map((dish) => ({ ...dish, photo: DISH_PHOTOS[dish.id] }));

export function findDish(id: string): Dish | undefined {
  return DISHES.find((dish) => dish.id === id);
}

/** Every dish a kitchen cooks in a window, in menu-section order. */
export function menuFor(kitchen: Kitchen, window: MealWindowId): Dish[] {
  const inWindow = DISHES.filter((dish) => dish.kitchenId === kitchen.id && dish.windows.includes(window));
  // A closed kitchen still shows a menu — the whole point of the closed state is
  // that you can read it now and order when it opens — so fall back to whatever
  // the kitchen cooks at all rather than returning nothing.
  const list = inWindow.length ? inWindow : DISHES.filter((dish) => dish.kitchenId === kitchen.id);
  return [...list].sort(
    (a, b) => kitchen.sections.indexOf(a.section) - kitchen.sections.indexOf(b.section),
  );
}

/** Kitchens cooking in a window, open ones first, then the closed previews. */
export function kitchensFor(window: MealWindowId): Kitchen[] {
  return [...KITCHENS].sort((a, b) => {
    const openDelta = Number(kitchenOpen(b, window)) - Number(kitchenOpen(a, window));
    return openDelta !== 0 ? openDelta : a.walkMinutes - b.walkMinutes;
  });
}

/** Dishes available in a window, cheapest first — the feed's default order. */
export function dishesFor(window: MealWindowId): Dish[] {
  return DISHES.filter((dish) => dish.windows.includes(window)).sort((a, b) => a.price - b.price);
}

/* ------------------------------------------------------------------ *
 * Coupons
 * ------------------------------------------------------------------ */

export const COUPONS: readonly Coupon[] = [
  {
    code: 'STUDENT20',
    headline: '₹20 off',
    body: '₹20 off any single meal over ₹99. Built for one student ordering one meal, so there is no basket minimum beyond that.',
    discount: 20,
    minimum: 99,
    excludes: ['PICKUP10', 'MESS175'],
  },
  {
    code: 'PICKUP10',
    headline: '₹10 off',
    body: '₹10 off when you collect from the counter yourself.',
    discount: 10,
    minimum: 0,
    excludes: ['STUDENT20'],
    pickupOnly: true,
  },
  {
    code: 'MESS175',
    headline: '₹35 off',
    body: '₹35 off orders over ₹175 from mess kitchens.',
    discount: 35,
    minimum: 175,
    excludes: ['STUDENT20'],
  },
  {
    code: 'NIGHT15',
    headline: '₹15 off',
    body: '₹15 off in the late-night window.',
    discount: 15,
    minimum: 0,
    blockedReason: 'After 11 pm',
  },
  {
    code: 'FIRSTUPI',
    headline: '₹25 off',
    body: '₹25 off your first UPI payment.',
    discount: 25,
    minimum: 0,
    blockedReason: 'Already used',
  },
];

export function findCoupon(code: string): Coupon | undefined {
  const wanted = code.trim().toUpperCase();
  return COUPONS.find((coupon) => coupon.code === wanted);
}

/* ------------------------------------------------------------------ *
 * Delivery targets
 * ------------------------------------------------------------------ */

export const FOOD_ADDRESSES: readonly FoodAddress[] = [
  {
    id: 'room',
    kind: 'room',
    title: 'Block C · Room 214',
    detail: '3rd floor, from your booking',
    instructions: 'Ring the bell twice, door left of the stairs',
    fromBooking: true,
    serviceable: true,
    deliveryFee: 9,
  },
  {
    id: 'gate',
    kind: 'gate',
    title: 'Main gate',
    detail: "Hand over at reception · after 11:30 pm this is the only option",
    serviceable: true,
    deliveryFee: 9,
  },
  {
    id: 'friend',
    kind: 'gate',
    title: "Sai Teja Hostel gate",
    detail: "A friend's PG · ₹19 delivery from here",
    serviceable: false,
    unserviceableNote: 'No kitchen delivers to this building yet',
    deliveryFee: 19,
  },
];

/* ------------------------------------------------------------------ *
 * Orders
 * ------------------------------------------------------------------ */

/**
 * Seeded history, plus one live order.
 *
 * The live one is a pickup at Annapurna sitting in `ready`, because that is the
 * state with the most to draw — a filled chip, a hold deadline, a pickup code
 * and directions — and it is the state a screenshot of this module should show.
 */
export const SEED_ORDERS: readonly FoodOrder[] = [
  {
    id: '8842',
    kitchenId: 'annapurna',
    kitchenName: 'Annapurna Mess',
    status: 'ready',
    fulfilment: 'pickup',
    window: 'lunch',
    lines: [
      { dishId: 'veg-thali', name: 'Unlimited veg thali', qty: 1, price: 110, diet: 'veg', note: 'Extra curd, medium spice' },
      { dishId: 'filter-coffee', name: 'Filter coffee', qty: 1, price: 25, diet: 'veg' },
    ],
    itemTotal: 135,
    deliveryFee: 0,
    taxes: 7,
    discount: 20,
    couponCode: 'STUDENT20',
    paid: 122,
    placedLabel: 'Today, 1:19 pm',
    monthLabel: 'This month',
    paymentLabel: 'GPay · 418 220 553 901',
    pickupCode: '4471',
    timeline: [
      { label: 'Order placed', at: '1:19 pm' },
      { label: 'Confirmed by the kitchen', at: '1:21 pm' },
      { label: 'Preparing', at: '1:23–1:28 pm' },
      { label: 'Ready at the counter', at: '1:28 pm', note: 'Held until 1:48 pm' },
      { label: 'Picked up', note: 'The counter marks it when you collect' },
    ],
  },
  {
    id: '8790',
    kitchenId: 'mumbai',
    kitchenName: 'Mumbai Bites',
    status: 'refunded',
    fulfilment: 'delivery',
    window: 'dinner',
    lines: [{ dishId: 'bombay-sandwich', name: 'Bombay sandwich', qty: 1, price: 80, diet: 'veg' }],
    itemTotal: 80,
    deliveryFee: 9,
    taxes: 0,
    discount: 0,
    paid: 89,
    placedLabel: 'Fri, 7:12 pm',
    monthLabel: 'This month',
    paymentLabel: 'GPay',
    refund: {
      amount: 89,
      destination: 'the HDFC account behind rahul@okhdfcbank',
      expectedBy: 'Tue 19 Aug',
      reference: 'RFND 8790 2214',
      status: 'sentToBank',
      reason: 'The kitchen closed early and could not cook your sandwich.',
    },
  },
  {
    id: '8801',
    kitchenId: 'srisai',
    kitchenName: 'Sri Sai Tiffins',
    status: 'delivered',
    fulfilment: 'delivery',
    window: 'breakfast',
    lines: [{ dishId: 'podi-idli', name: 'Ghee podi idli', qty: 2, price: 70, diet: 'veg' }],
    itemTotal: 140,
    deliveryFee: 9,
    taxes: 0,
    discount: 9,
    paid: 140,
    placedLabel: 'Today, 8:14 am',
    monthLabel: 'This month',
    paymentLabel: 'GPay',
  },
  {
    id: '8760',
    kitchenId: 'bawarchi',
    kitchenName: 'Bawarchi Express',
    status: 'pickedUp',
    fulfilment: 'pickup',
    window: 'dinner',
    lines: [{ dishId: 'chicken-biryani', name: 'Chicken 65 biryani', qty: 1, price: 160, diet: 'nonveg' }],
    itemTotal: 160,
    deliveryFee: 0,
    taxes: 0,
    discount: 0,
    paid: 160,
    placedLabel: 'Yesterday, 9:02 pm',
    monthLabel: 'This month',
    paymentLabel: 'HDFC •••• 4412',
  },
  {
    id: '8611',
    kitchenId: 'nightowl',
    kitchenName: 'Night Owl Maggi Point',
    status: 'pickedUp',
    fulfilment: 'pickup',
    window: 'lateNight',
    lines: [
      { dishId: 'cheese-maggi', name: 'Cheese maggi', qty: 1, price: 60, diet: 'veg' },
      { dishId: 'masala-chai', name: 'Masala chai', qty: 2, price: 20, diet: 'veg' },
    ],
    itemTotal: 100,
    deliveryFee: 0,
    taxes: 0,
    discount: 0,
    paid: 100,
    placedLabel: '11 Aug, 12:40 am',
    monthLabel: 'Earlier',
    paymentLabel: 'LAMPOSE wallet',
  },
];

/** What the student has hearted. Seeded so the screen is not empty on day one. */
export const SEED_FAVOURITE_DISHES: readonly string[] = ['podi-idli', 'veg-thali', 'chicken-biryani', 'egg-dosa'];
export const SEED_FAVOURITE_KITCHENS: readonly string[] = ['annapurna', 'srisai'];

/* ══════════════════════════════════════════════════════════════════════════
   Seed a real, complete menu onto an existing food partner.

     npm run seed:food-menu                    -- the only approved restaurant
     npm run seed:food-menu -- --restaurant FP-XXXXXXXX
     npm run seed:food-menu -- --keep          -- add alongside what is there
     npm run seed:food-menu -- --dry           -- resolve and print, write nothing
     npm run seed:food-menu -- --photos-only   -- only fill in missing photographs

   ## What it does

   1. Widens the restaurant's opening hours to 07:00–02:00 on all seven days,
      so every one of the customer app's five meal windows is covered and
      there is something to look at whatever time it is opened. The app
      derives its windows from these hours — see
      `User App/services/adapters/food.adapter.ts`.
   2. Writes fifty dishes across eight sections, every schema field populated.
   3. Gives each one a photograph that is actually of that dish.

   ## Where the photographs come from

   Wikimedia Commons, resolved through their search API so the file is real
   rather than a guessed filename — and then UPLOADED TO CLOUDINARY, which
   matters. Commons asks not to be used as a CDN by applications, and the
   files carry per-file licences. Copying each one into our own Cloudinary
   folder means production serves its own bytes, exactly as it does for a
   photograph a restaurant took itself. Nothing hotlinks.

   A dish whose image cannot be resolved or uploaded is still written, without
   a photo. Every food layout in the app is built to work without one, and a
   broken image link is worse than none.

   ## What is deliberately NOT seeded

   `ratingAvg` and `ratingCount` stay at zero. They are derived from customer
   reviews, and no review exists — inventing them would put a fabricated 4.3
   in front of a diner deciding where to eat, which is the one number on the
   card they actually act on. The app renders "New" for a kitchen with none,
   which is true.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');
const FoodProduct = require('../src/modules/foodpartners/foodProduct.model');

/* Refuse to run against production. See src/infrastructure/database/guard.js */
require('../src/infrastructure/database/guard').assertDevTargetOrExit();


const { makeProductId } = FoodProduct;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const DRY = flag('dry');
const KEEP = flag('keep');
const WANT_ID = value('restaurant');
/* Re-running the whole seed re-uploads every photograph and leaves the
   previous fifty orphaned in Cloudinary. This fills the gaps instead. */
const PHOTOS_ONLY = flag('photos-only');

/* Every day, 07:00 to 02:00 the next morning. One slot that wraps past
   midnight covers breakfast, lunch, snacks, dinner AND late night — the model
   and the app's window derivation both handle the wrap. */
const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const OPENING_HOURS = WEEK.map((day) => ({ day, openTime: '07:00', closeTime: '02:00' }));

/* ── The menu ──────────────────────────────────────────────────────────────
   Prices are what a college-adjacent kitchen in coastal Andhra actually
   charges. `search` is the Commons query, kept beside the dish so a wrong
   photograph is fixed in one place. */

const V = 'veg';
const N = 'non-veg';
const E = 'egg';

const MENU = [
  // ── Breakfast ───────────────────────────────────────────────────────────
  { name: 'Ghee Podi Idli', search: 'Podi idli', cat: 'Breakfast', price: 70, veg: V, spice: 'medium', serves: 1, kcal: 310, prep: 10, tags: ['Bestseller'], allergens: ['Dairy'], desc: 'Steamed mini idlis tossed in ghee and gunpowder podi, with coconut chutney.', variants: [['6 pieces', 70], ['10 pieces', 105]], addOns: [['Extra podi', 10], ['Extra chutney', 15]] },
  { name: 'Masala Dosa', search: 'Masala dosa', cat: 'Breakfast', price: 90, veg: V, spice: 'mild', serves: 1, kcal: 420, prep: 12, tags: ['Bestseller'], allergens: [], desc: 'Crisp rice crepe folded over spiced potato, with sambar and two chutneys.', variants: [['Plain', 70], ['Masala', 90], ['Ghee roast', 120]], addOns: [['Extra sambar', 15]] },
  { name: 'Idli Sambar Plate', search: 'Idli sambar', cat: 'Breakfast', price: 60, veg: V, spice: 'mild', serves: 1, kcal: 280, prep: 8, tags: [], allergens: [], desc: 'Four steamed idlis, lentil sambar and fresh coconut chutney.', variants: [['2 pieces', 40], ['4 pieces', 60]], addOns: [['Ghee spoon', 10]] },
  { name: 'Medu Vada', search: 'Medu vada', cat: 'Breakfast', price: 50, veg: V, spice: 'mild', serves: 1, kcal: 330, prep: 10, tags: [], allergens: [], desc: 'Urad dal doughnuts fried to order, crisp outside and soft within.', variants: [['2 pieces', 50], ['4 pieces', 90]], addOns: [['Sambar bowl', 20]] },
  { name: 'Ven Pongal', search: 'Ven pongal', cat: 'Breakfast', price: 75, veg: V, spice: 'mild', serves: 1, kcal: 390, prep: 12, tags: [], allergens: ['Dairy', 'Nuts'], desc: 'Rice and moong dal cooked soft with pepper, cumin, cashew and ghee.', variants: [], addOns: [['Extra ghee', 10]] },
  { name: 'Onion Uttapam', search: 'Uttapam', cat: 'Breakfast', price: 85, veg: V, spice: 'medium', serves: 1, kcal: 360, prep: 14, tags: [], allergens: [], desc: 'Thick pancake griddled with onion, green chilli and coriander.', variants: [['Onion', 85], ['Tomato onion', 95]], addOns: [] },
  { name: 'Aloo Paratha', search: 'Aloo paratha', cat: 'Breakfast', price: 80, veg: V, spice: 'medium', serves: 1, kcal: 450, prep: 15, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Wholewheat flatbread stuffed with spiced potato, served with curd and pickle.', variants: [['1 piece', 80], ['2 pieces', 145]], addOns: [['Butter', 15], ['Extra curd', 20]] },
  { name: 'Masala Omelette', search: 'Masala omelette', cat: 'Breakfast', price: 65, veg: E, spice: 'medium', serves: 1, kcal: 290, prep: 8, tags: [], allergens: ['Egg'], desc: 'Two eggs beaten with onion, chilli and coriander, folded soft.', variants: [['2 egg', 65], ['3 egg', 90]], addOns: [['Cheese', 25], ['Bread slices', 15]] },
  { name: 'Egg Dosa', search: 'Egg dosa', cat: 'Breakfast', price: 95, veg: E, spice: 'medium', serves: 1, kcal: 440, prep: 12, tags: [], allergens: ['Egg'], desc: 'Dosa with an egg cracked and spread across it, pepper and onion on top.', variants: [], addOns: [['Extra egg', 20]] },
  { name: 'Poori Sagu', search: 'Poori sagu', cat: 'Breakfast', price: 75, veg: V, spice: 'mild', serves: 1, kcal: 480, prep: 12, tags: [], allergens: ['Gluten'], desc: 'Three puffed pooris with a light potato and onion sagu.', variants: [], addOns: [] },

  // ── Lunch: thalis & rice ────────────────────────────────────────────────
  { name: 'South Indian Veg Thali', search: 'South Indian thali', cat: 'Lunch Thalis', price: 140, veg: V, spice: 'medium', serves: 1, kcal: 780, prep: 15, tags: ['Bestseller'], allergens: ['Dairy'], desc: 'Rice, sambar, rasam, two vegetables, curd, pickle, papad and a sweet.', variants: [['Regular', 140], ['Full meals', 180]], addOns: [['Extra rice', 25], ['Extra curd', 20]] },
  { name: 'Paneer Butter Masala Thali', search: 'Paneer butter masala', cat: 'Lunch Thalis', price: 190, veg: V, spice: 'mild', serves: 1, kcal: 860, prep: 20, tags: ["Chef's Special"], allergens: ['Dairy', 'Nuts', 'Gluten'], desc: 'Paneer in a tomato-cashew gravy with two rotis, jeera rice and salad.', variants: [], addOns: [['Extra roti', 15], ['Butter naan', 45]] },
  { name: 'Hyderabadi Chicken Biryani', search: 'Hyderabadi biryani', cat: 'Lunch Thalis', price: 220, offer: 189, veg: N, spice: 'hot', serves: 1, kcal: 940, prep: 25, tags: ['Bestseller', 'Must Try'], allergens: ['Dairy'], desc: 'Long-grain rice dum-cooked with marinated chicken, served with raita and salan.', variants: [['Single', 220], ['Family pack', 620]], addOns: [['Extra raita', 30], ['Mirchi ka salan', 40], ['Boiled egg', 20]] },
  { name: 'Vegetable Dum Biryani', search: 'Vegetable biryani', cat: 'Lunch Thalis', price: 170, veg: V, spice: 'medium', serves: 1, kcal: 720, prep: 22, tags: [], allergens: ['Dairy'], desc: 'Seasonal vegetables layered with saffron rice and slow-cooked under dough.', variants: [['Single', 170], ['Family pack', 480]], addOns: [['Extra raita', 30]] },
  { name: 'Egg Biryani', search: 'Egg biryani', cat: 'Lunch Thalis', price: 160, veg: E, spice: 'medium', serves: 1, kcal: 700, prep: 20, tags: [], allergens: ['Egg', 'Dairy'], desc: 'Dum biryani with two whole spiced eggs folded through the rice.', variants: [], addOns: [['Extra egg', 20]] },
  { name: 'Curd Rice', search: 'Curd rice', cat: 'Lunch Thalis', price: 70, veg: V, spice: 'none', serves: 1, kcal: 340, prep: 8, tags: [], allergens: ['Dairy'], desc: 'Soft rice folded into set curd, tempered with mustard, curry leaf and ginger.', variants: [], addOns: [['Pickle', 10]] },
  { name: 'Rajma Chawal', search: 'Rajma chawal', cat: 'Lunch Thalis', price: 130, veg: V, spice: 'medium', serves: 1, kcal: 650, prep: 18, tags: [], allergens: [], desc: 'Kidney beans simmered in an onion-tomato masala over steamed rice.', variants: [], addOns: [['Papad', 10]] },
  { name: 'Dal Fry with Rice', search: 'Dal curry with naan and rice', cat: 'Lunch Thalis', price: 110, veg: V, spice: 'mild', serves: 1, kcal: 560, prep: 15, tags: [], allergens: ['Dairy'], desc: 'Yellow dal tempered with cumin, garlic and ghee, with steamed rice.', variants: [], addOns: [['Extra rice', 25]] },
  { name: 'Egg Curry with Rice', search: 'Egg curry', cat: 'Lunch Thalis', price: 140, veg: E, spice: 'hot', serves: 1, kcal: 620, prep: 18, tags: [], allergens: ['Egg'], desc: 'Two boiled eggs in a peppery Andhra gravy, with rice.', variants: [], addOns: [['Extra egg', 20]] },

  // ── Snacks & chaat ──────────────────────────────────────────────────────
  { name: 'Punjabi Samosa', search: 'Punjabi samosa', cat: 'Snacks & Chaat', price: 25, veg: V, spice: 'medium', serves: 1, kcal: 260, prep: 5, tags: ['Bestseller'], allergens: ['Gluten'], desc: 'Flaky pastry filled with spiced potato and peas, with tamarind chutney.', variants: [['1 piece', 25], ['2 pieces', 45]], addOns: [['Chutney cup', 10]] },
  { name: 'Mirchi Bajji', search: 'Mirchi bajji', cat: 'Snacks & Chaat', price: 40, veg: V, spice: 'hot', serves: 1, kcal: 300, prep: 10, tags: ['Spicy'], allergens: [], desc: 'Large green chillies stuffed, dipped in gram flour and fried to order.', variants: [['2 pieces', 40], ['4 pieces', 75]], addOns: [] },
  { name: 'Vada Pav', search: 'Vada pav', cat: 'Snacks & Chaat', price: 35, veg: V, spice: 'hot', serves: 1, kcal: 320, prep: 7, tags: [], allergens: ['Gluten'], desc: 'Potato vada in a soft pav with dry garlic chutney and a fried chilli.', variants: [], addOns: [['Extra chutney', 8]] },
  { name: 'Pav Bhaji', search: 'Pav bhaji', cat: 'Snacks & Chaat', price: 110, veg: V, spice: 'medium', serves: 1, kcal: 640, prep: 15, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Mashed vegetable bhaji finished with butter, two buttered pavs alongside.', variants: [['Regular', 110], ['Extra butter', 130]], addOns: [['Extra pav', 20], ['Cheese', 30]] },
  { name: 'Pani Puri', search: 'Pani puri', cat: 'Snacks & Chaat', price: 50, veg: V, spice: 'hot', serves: 1, kcal: 230, prep: 6, tags: [], allergens: ['Gluten'], desc: 'Six crisp puris with spiced potato and chilled mint water.', variants: [['6 pieces', 50], ['10 pieces', 80]], addOns: [] },
  { name: 'Bombay Grilled Sandwich', search: 'Bombay sandwich', cat: 'Snacks & Chaat', price: 80, veg: V, spice: 'mild', serves: 1, kcal: 420, prep: 10, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Layered potato, beetroot and cucumber with chutney, pressed and grilled.', variants: [['Plain', 80], ['Cheese', 110]], addOns: [['Extra cheese', 30]] },
  { name: 'Cheese Maggi', search: 'Maggi instant noodles cooked', cat: 'Snacks & Chaat', price: 70, veg: V, spice: 'mild', serves: 1, kcal: 400, prep: 8, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Masala noodles cooked soft with onion, tomato and a slice of cheese.', variants: [['Plain', 55], ['Cheese', 70], ['Double cheese', 90]], addOns: [['Boiled egg', 20]] },
  { name: 'Chicken 65', search: 'Chicken 65', cat: 'Snacks & Chaat', price: 180, veg: N, spice: 'hot', serves: 2, kcal: 520, prep: 18, tags: ["Chef's Special", 'Spicy'], allergens: ['Dairy'], desc: 'Boneless chicken marinated in curd and chilli, fried with curry leaf.', variants: [['Half', 180], ['Full', 320]], addOns: [['Onion salad', 15]] },
  { name: 'Gobi Manchurian', search: 'Gobi Manchurian', cat: 'Snacks & Chaat', price: 130, veg: V, spice: 'hot', serves: 2, kcal: 480, prep: 16, tags: [], allergens: ['Gluten', 'Soy'], desc: 'Cauliflower florets tossed in a garlic, soy and chilli sauce.', variants: [['Dry', 130], ['Gravy', 145]], addOns: [] },

  // ── Dinner: curries ─────────────────────────────────────────────────────
  { name: 'Butter Chicken', search: 'Butter chicken', cat: 'Dinner Curries', price: 260, offer: 235, veg: N, spice: 'mild', serves: 2, kcal: 780, prep: 22, tags: ['Bestseller'], allergens: ['Dairy', 'Nuts'], desc: 'Tandoori chicken finished in a tomato, butter and cream gravy.', variants: [['Half', 260], ['Full', 460]], addOns: [['Butter naan', 45], ['Jeera rice', 90]] },
  { name: 'Andhra Chicken Curry', search: 'Chicken curry', cat: 'Dinner Curries', price: 240, veg: N, spice: 'hot', serves: 2, kcal: 690, prep: 25, tags: ['Spicy'], allergens: [], desc: 'Bone-in chicken in a dark roasted-spice gravy, hot the way the coast makes it.', variants: [['Half', 240], ['Full', 430]], addOns: [['Extra gravy', 30]] },
  { name: 'Mutton Rogan Josh', search: 'Rogan josh', cat: 'Dinner Curries', price: 320, veg: N, spice: 'medium', serves: 2, kcal: 820, prep: 35, tags: [], allergens: ['Dairy'], desc: 'Slow-cooked mutton on the bone in a Kashmiri chilli and yoghurt gravy.', variants: [], addOns: [['Extra gravy', 40]] },
  { name: 'Fish Fry, Coastal Style', search: 'Fish fry Indian', cat: 'Dinner Curries', price: 230, veg: N, spice: 'hot', serves: 1, kcal: 430, prep: 20, tags: [], allergens: ['Shellfish'], desc: 'Whole fish rubbed with chilli and turmeric, shallow-fried till the edges crisp.', variants: [], addOns: [['Lemon and onion', 10]] },
  { name: 'Paneer Butter Masala', search: 'Paneer butter masala', cat: 'Dinner Curries', price: 210, veg: V, spice: 'mild', serves: 2, kcal: 700, prep: 20, tags: ['Bestseller'], allergens: ['Dairy', 'Nuts'], desc: 'Cottage cheese cubes in a rich tomato and cashew gravy.', variants: [['Half', 210], ['Full', 370]], addOns: [['Butter naan', 45]] },
  { name: 'Chole Bhature', search: 'Chole bhature', cat: 'Dinner Curries', price: 150, veg: V, spice: 'medium', serves: 1, kcal: 810, prep: 18, tags: [], allergens: ['Gluten'], desc: 'Spiced chickpeas with two puffed bhature, onion and pickle.', variants: [], addOns: [['Extra bhatura', 35]] },
  { name: 'Tandoori Chicken', search: 'Tandoori chicken', cat: 'Dinner Curries', price: 290, veg: N, spice: 'medium', serves: 2, kcal: 560, prep: 28, tags: ["Chef's Special"], allergens: ['Dairy'], desc: 'Half bird marinated overnight in yoghurt and spice, cooked in the tandoor.', variants: [['Half', 290], ['Full', 540]], addOns: [['Mint chutney', 15]] },
  { name: 'Dal Tadka', search: 'Dal tadka', cat: 'Dinner Curries', price: 120, veg: V, spice: 'mild', serves: 2, kcal: 380, prep: 15, tags: [], allergens: ['Dairy'], desc: 'Yellow lentils under a hot tempering of ghee, garlic and dried chilli.', variants: [], addOns: [] },

  // ── Breads ──────────────────────────────────────────────────────────────
  { name: 'Butter Naan', search: 'Butter naan', cat: 'Breads', price: 45, veg: V, spice: 'none', serves: 1, kcal: 260, prep: 8, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Leavened flatbread from the tandoor, brushed with butter.', variants: [['Plain', 35], ['Butter', 45], ['Garlic', 55]], addOns: [] },
  { name: 'Tandoori Roti', search: 'Tandoori roti', cat: 'Breads', price: 25, veg: V, spice: 'none', serves: 1, kcal: 150, prep: 7, tags: [], allergens: ['Gluten'], desc: 'Wholewheat roti cooked against the wall of the tandoor.', variants: [['Plain', 25], ['Butter', 35]], addOns: [] },
  { name: 'Paneer Paratha', search: 'Paneer paratha', cat: 'Breads', price: 90, veg: V, spice: 'mild', serves: 1, kcal: 470, prep: 15, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Stuffed with crumbled paneer, green chilli and coriander.', variants: [], addOns: [['Curd bowl', 20]] },

  // ── Chinese ─────────────────────────────────────────────────────────────
  { name: 'Veg Fried Rice', search: 'Vegetable fried rice', cat: 'Chinese', price: 120, veg: V, spice: 'medium', serves: 1, kcal: 590, prep: 14, tags: [], allergens: ['Soy'], desc: 'Rice tossed hard over flame with spring onion, carrot and cabbage.', variants: [['Veg', 120], ['Egg', 140], ['Chicken', 165]], addOns: [['Extra sauce', 10]] },
  { name: 'Hakka Noodles', search: 'Hakka noodles', cat: 'Chinese', price: 125, veg: V, spice: 'medium', serves: 1, kcal: 610, prep: 14, tags: [], allergens: ['Gluten', 'Soy'], desc: 'Wheat noodles stir-fried with shredded vegetables and dark soy.', variants: [['Veg', 125], ['Egg', 145], ['Chicken', 170]], addOns: [] },
  { name: 'Chilli Chicken', search: 'Chilli chicken Indian', cat: 'Chinese', price: 190, veg: N, spice: 'hot', serves: 2, kcal: 540, prep: 18, tags: ['Spicy'], allergens: ['Soy', 'Gluten'], desc: 'Battered chicken tossed with capsicum, onion and green chilli.', variants: [['Dry', 190], ['Gravy', 205]], addOns: [] },
  { name: 'Veg Spring Rolls', search: 'Vegetable spring roll', cat: 'Chinese', price: 100, veg: V, spice: 'mild', serves: 1, kcal: 350, prep: 12, tags: [], allergens: ['Gluten', 'Soy'], desc: 'Four crisp rolls packed with cabbage and carrot, sweet chilli dip.', variants: [], addOns: [] },
  { name: 'Chicken Manchurian', search: 'Gobi Manchurian dish', cat: 'Chinese', price: 185, veg: N, spice: 'hot', serves: 2, kcal: 570, prep: 18, tags: [], allergens: ['Soy', 'Gluten'], desc: 'Chicken dumplings in a garlic, ginger and soy gravy.', variants: [['Dry', 185], ['Gravy', 200]], addOns: [] },

  // ── Desserts ────────────────────────────────────────────────────────────
  { name: 'Gulab Jamun', search: 'Gulab jamun', cat: 'Desserts', price: 60, veg: V, spice: 'none', serves: 1, kcal: 380, prep: 5, tags: ['Bestseller'], allergens: ['Dairy', 'Gluten'], desc: 'Two warm milk-solid dumplings soaked in cardamom syrup.', variants: [['2 pieces', 60], ['4 pieces', 110]], addOns: [] },
  { name: 'Rasmalai', search: 'Ras malai', cat: 'Desserts', price: 80, veg: V, spice: 'none', serves: 1, kcal: 340, prep: 5, tags: [], allergens: ['Dairy', 'Nuts'], desc: 'Chilled paneer discs in saffron milk, topped with pistachio.', variants: [], addOns: [] },
  { name: 'Rice Kheer', search: 'Rice kheer', cat: 'Desserts', price: 70, veg: V, spice: 'none', serves: 1, kcal: 320, prep: 6, tags: [], allergens: ['Dairy', 'Nuts'], desc: 'Rice slow-cooked in milk with cardamom, raisin and almond.', variants: [], addOns: [] },

  // ── Beverages ───────────────────────────────────────────────────────────
  { name: 'Filter Coffee', search: 'Indian filter coffee', cat: 'Beverages', price: 30, veg: V, spice: 'none', serves: 1, kcal: 90, prep: 5, tags: ['Bestseller'], allergens: ['Dairy'], desc: 'Decoction and hot milk, pulled between tumbler and dabarah.', variants: [['Regular', 30], ['Strong', 35]], addOns: [] },
  { name: 'Masala Chai', search: 'Masala chai', cat: 'Beverages', price: 25, veg: V, spice: 'mild', serves: 1, kcal: 80, prep: 5, tags: [], allergens: ['Dairy'], desc: 'Boiled with ginger, cardamom and clove until the milk turns.', variants: [['Regular', 25], ['Large', 35]], addOns: [] },
  { name: 'Sweet Lassi', search: 'Lassi', cat: 'Beverages', price: 60, veg: V, spice: 'none', serves: 1, kcal: 240, prep: 5, tags: [], allergens: ['Dairy'], desc: 'Thick set curd blended with sugar and a pinch of cardamom.', variants: [['Sweet', 60], ['Salted', 55], ['Mango', 75]], addOns: [] },
];

/* ── Photographs ───────────────────────────────────────────────────────── */

const UA = 'LamposeFoodSeed/1.0 (https://lampose.com; dev@lampose.in)';

/**
 * The image bytes for a Commons URL.
 *
 * Downloaded HERE and handed to Cloudinary as base64, rather than giving
 * Cloudinary the URL and letting it fetch. Cloudinary's fetchers come from a
 * shared pool that upload.wikimedia.org rate-limits hard — every dish past the
 * first few came back 429 — whereas a single polite client with a real
 * User-Agent, which is what Wikimedia asks for, is served without complaint.
 */
async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} fetching the image`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`not an image (${type})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buffer.toString('base64')}`;
}

/*
 * Commons search returns whatever matches the words, and the words are not
 * always about food. "Dal tadka bowl" once came back with a flag map of
 * Yugoslavia, and "Manchurian" with a portrait of a Qing noblewoman — both
 * perfectly good matches for a text query and both catastrophic on a menu.
 *
 * So a candidate has to earn its place twice: its filename must share a real
 * word with what we asked for, AND must not look like one of the categories
 * Commons is otherwise full of. A dish with no candidate that passes is
 * written without a photograph, which is the honest outcome.
 */
const NOT_FOOD = [
  'flag', 'map', 'coat of arms', 'stamp', 'logo', 'poster', 'portrait', 'lady',
  'noble', 'emperor', 'temple', 'building', 'railway', 'station', 'street',
  'festival', 'wikipedia', 'diagram', 'chart', 'banknote', 'coin', 'monument',
];

/** Words worth matching on — "the", "of", "with" prove nothing. */
const STOP = new Set(['the', 'of', 'with', 'and', 'a', 'in', 'on', 'dish', 'indian', 'bowl', 'glass', 'plate', 'cooked']);

const readableName = (url) =>
  decodeURIComponent(String(url).split('/').pop() || '')
    .replace(/^\d+px-/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase();

function looksRight(url, term) {
  const name = readableName(url);
  if (NOT_FOOD.some((bad) => name.includes(bad))) return false;
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  /* Every query keeps at least one real word — a term made entirely of stop
     words would accept anything, so it accepts nothing instead. */
  if (!words.length) return false;
  return words.some((word) => name.includes(word));
}

/** A real Commons file for a dish, resolved by search AND sanity-checked. */
async function findPhoto(term) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${term}`,
    gsrlimit: '4',
    gsrnamespace: '6',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '1000',
  }).toString();

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const pages = Object.values(json?.query?.pages ?? {});
  /* Commons orders hits by relevance, so walk them in that order and take the
     first that also passes the sanity check. */
  const ordered = pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const page of ordered) {
    const thumb = page?.imageinfo?.[0]?.thumburl;
    if (!thumb) continue;
    const clean = String(thumb).split('?')[0];
    if (looksRight(clean, term)) return clean;
  }
  return null;
}

const cloudinaryReady = () => {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return false;
  cloudinary.config({ cloud_name, api_key, api_secret });
  return true;
};

/* ── Building a product ────────────────────────────────────────────────── */

const pairs = (rows) => rows.map(([name, price]) => ({ name, price }));

const productFor = (item, restaurantId, order, image) => ({
  productId: makeProductId(),
  restaurantId,
  productName: item.name,
  description: item.desc,
  category: item.cat,
  price: item.price,
  discountedPrice: item.offer ?? null,
  isVeg: item.veg,
  isAvailable: true,
  productImage: image ? { url: image.url, publicId: image.publicId } : undefined,
  galleryImages: [],
  variants: pairs(item.variants ?? []),
  addOns: pairs(item.addOns ?? []),
  spiceLevel: item.spice === 'none' ? null : item.spice,
  serves: item.serves,
  tags: item.tags ?? [],
  allergenInfo: item.allergens ?? [],
  calories: item.kcal,
  preparationTime: item.prep,
  displayOrder: order,
  /* Left at the schema default of zero. Ratings come from customers who have
     eaten here, and nobody has — see the header. */
});

/* ── Run ───────────────────────────────────────────────────────────────── */

(async () => {
  await connectDB().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable. Start it and re-run.\n');
    process.exit(2);
  }

  const restaurant = WANT_ID
    ? await FoodRestaurant.findOne({ restaurantId: WANT_ID })
    : await FoodRestaurant.findOne({ verificationStatus: 'approved' }).sort({ createdAt: 1 });

  if (!restaurant) {
    console.log('\nNo restaurant found. Pass --restaurant FP-XXXXXXXX.\n');
    process.exit(1);
  }

  const { restaurantId, restaurantName } = restaurant;
  console.log(`\nSeeding "${restaurantName}" (${restaurantId})`);
  console.log(`${MENU.length} dishes across ${new Set(MENU.map((m) => m.cat)).size} sections\n`);

  const haveCloudinary = cloudinaryReady();
  const folder = `lampose/food-partners/${restaurantId}/menu`;
  if (!haveCloudinary) {
    console.log('CLOUDINARY_* is not set — dishes will be written without photographs.\n');
  }

  if (PHOTOS_ONLY) {
    if (!haveCloudinary) {
      console.log('Nothing to do: CLOUDINARY_* is not configured.');
      process.exit(1);
    }
    const gaps = await FoodProduct.find({
      restaurantId,
      $or: [{ productImage: { $exists: false } }, { 'productImage.url': { $in: ['', null] } }],
    });
    console.log(`${gaps.length} dish(es) without a photograph`);

    for (const doc of gaps) {
      const item = MENU.find((m) => m.name === doc.productName);
      const term = item ? item.search : doc.productName;
      try {
        const source = await findPhoto(term);
        if (!source) { console.log(`  x ${doc.productName}  (no match for "${term}")`); continue; }
        const uploaded = await cloudinary.uploader.upload(await download(source), {
          folder, resource_type: 'image',
          transformation: [{ width: 1000, height: 750, crop: 'fill', gravity: 'auto', quality: 'auto' }],
        });
        if (!DRY) {
          doc.productImage = { url: uploaded.secure_url, publicId: uploaded.public_id };
          await doc.save();
        }
        console.log(`  + ${doc.productName}  <-  ${readableName(source)}`);
      } catch (error) {
        console.log(`  x ${doc.productName}  (${error.message})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    console.log('');
    await closeConnections().catch(() => {});
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  }

  /* 1. Hours, so every meal window has something in it. */
  if (!DRY) {
    restaurant.openingHours = OPENING_HOURS;
    restaurant.openState = 'auto';
    await restaurant.save();
  }
  console.log('Opening hours  07:00–02:00, all seven days (covers all five meal windows)');

  /* 2. Clear the old menu unless asked not to. */
  if (!KEEP) {
    const existing = await FoodProduct.find({ restaurantId }).select('productName').lean();
    if (existing.length) {
      console.log(`Removing ${existing.length} existing item(s): ${existing.map((e) => e.productName).join(', ')}`);
      if (!DRY) await FoodProduct.deleteMany({ restaurantId });
    }
  }

  /* 3. The dishes. */
  let withPhoto = 0;
  const failures = [];
  const chosen = [];
  const docs = [];

  for (let i = 0; i < MENU.length; i += 1) {
    const item = MENU[i];
    let image = null;

    if (haveCloudinary) {
      try {
        const source = await findPhoto(item.search);
        if (source) {
          /* Ours from here on: the bytes land in our Cloudinary account and
             production never hotlinks Commons. */
          const bytes = await download(source);
          const uploaded = await cloudinary.uploader.upload(bytes, {
            folder,
            resource_type: 'image',
            transformation: [{ width: 1000, height: 750, crop: 'fill', gravity: 'auto', quality: 'auto' }],
          });
          image = { url: uploaded.secure_url, publicId: uploaded.public_id };
          chosen.push(`${item.name}  <-  ${readableName(source)}`);
          withPhoto += 1;
        } else {
          failures.push(`${item.name} (no Commons match for "${item.search}")`);
        }
      } catch (error) {
        failures.push(`${item.name} (${error.message})`);
      }
      /* Polite to Commons — they rate-limit anonymous bursts, and a 429
         halfway through is how half a menu ends up without photographs. */
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    docs.push(productFor(item, restaurantId, i, image));
    process.stdout.write(`\r  ${i + 1}/${MENU.length}  ${item.name.padEnd(32).slice(0, 32)}`);
  }
  process.stdout.write('\n');

  if (!DRY) await FoodProduct.insertMany(docs);

  /* 4. What happened. */
  const bySection = docs.reduce((acc, doc) => ({ ...acc, [doc.category]: (acc[doc.category] || 0) + 1 }), {});

  console.log(`\n${'─'.repeat(64)}`);
  console.log(DRY ? 'DRY RUN — nothing was written' : `Wrote ${docs.length} dishes to food_products`);
  Object.entries(bySection).forEach(([section, n]) => console.log(`  ${String(n).padStart(3)}  ${section}`));
  console.log(`\n  ${withPhoto}/${docs.length} with a photograph on Cloudinary`);
  if (failures.length) {
    console.log(`\n  Without a photograph (stored anyway — every layout works without one):`);
    failures.forEach((f) => console.log(`    · ${f}`));
  }
  console.log(`${'─'.repeat(64)}\n`);

  await closeConnections().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
})();

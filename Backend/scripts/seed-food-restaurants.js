/* ══════════════════════════════════════════════════════════════════════════
   Seed a spread of restaurants, each with a full 50-dish menu, so the User
   App's food layouts have real volume to render against.

     npm run seed:food-restaurants
     npm run seed:food-restaurants -- --dry     -- resolve and print, write nothing
     npm run seed:food-restaurants -- --count 20

   ## What already existed

   `food_restaurants` already held two approved, active kitchens — "Testing-1"
   (owner +919704726252) and "Paradise Biryani House" (owner +918639139906).
   Those two numbers are TWO of the three the task named; the schema requires
   `ownerPhone` to be unique, so this script cannot create a second restaurant
   under either number — it leaves both of those documents untouched.

   Instead:
     · ONE new restaurant is owned by the third number, +919398334115, the
       one not already in use.
     · The rest get freshly generated, obviously-synthetic owner numbers
       (+91900000NNNN) — `ownerPhone` has to be unique per restaurant and
       there are only three real numbers to spend.
     · ALL new restaurants — and the two pre-existing ones, if their
       `contactNumber` is empty — get `contactNumber` (the customer-facing
       number the app's "call" button actually dials) rotated across the
       three real numbers. That is the field with no uniqueness constraint,
       and it is the one a diner testing the app would actually tap.

   ## Location

   Centred on the same point the existing "Testing-1" restaurant and the
   test customer "venky"'s own saved address already sit at — 17.4923 N,
   78.4534 E, Quthbullapur, Hyderabad. Scattered
   within about 1.5 km of it so the User App's "near you" ordering has
   something to actually order.

   ## The menu

   The same fifty dishes `seed-food-menu.js` writes onto one restaurant,
   copied here rather than imported — the two scripts are free to diverge,
   and importing one into the other would tie a single-restaurant top-up
   tool to a multi-restaurant seeding one for three lines of data. Each
   dish's photo is resolved and uploaded to Cloudinary ONCE, not once per
   restaurant: fifty Commons look-ups shared across every kitchen rather
   than fifty times the restaurant count, since it is the same photograph
   of the same dish either way.
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
const { makeRestaurantId, hashPassword } = FoodRestaurant;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : null;
};

const DRY = flag('dry');
const COUNT = Math.max(1, Number(value('count')) || 13); // +2 existing = 15 by default

/* The three real, reachable numbers this task named. E.164 for `ownerPhone`
   (which the login route matches on); the app dials `contactNumber` as
   typed, so the same digits work there without the prefix either way. */
const REAL_NUMBERS = ['+918639139906', '+919704726252', '+919398334115'];
const TEST_PASSWORD = 'Lampose@123';

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const OPENING_HOURS = WEEK.map((day) => ({ day, openTime: '07:00', closeTime: '02:00' }));

/* Quthbullapur, Hyderabad — see the header for why this exact point. */
const CENTER = { lng: 78.4534547, lat: 17.4923367 };
/** A point within ~1.5km of centre, one degree of latitude being ~111km. */
function jitter(seed) {
  const angle = (seed * 137.51) % 360; // golden-angle spread, so points fan out rather than cluster
  const radiusKm = 0.4 + (seed % 5) * 0.25; // 0.4km .. 1.4km
  const rad = (angle * Math.PI) / 180;
  const dLat = (radiusKm / 111) * Math.cos(rad);
  const dLng = (radiusKm / (111 * Math.cos((CENTER.lat * Math.PI) / 180))) * Math.sin(rad);
  return [CENTER.lng + dLng, CENTER.lat + dLat];
}

/* ── The fifteen ─────────────────────────────────────────────────────────
   Name, cuisines (from FoodRestaurant.CUISINE_TYPES), a landmark, and the
   delivery-fee scheme — varied on purpose so the three schemes
   (`FulfilmentToggle` reads all three) each have more than one example on
   screen. */
const PROFILES = [
  { name: 'Sri Balaji Tiffins', cuisines: ['South Indian'], landmark: 'Opposite Balaji Function Hall', fee: { type: 'flat', amount: 25 }, minOrder: 80 },
  { name: 'Annapurna Mess', cuisines: ['South Indian', 'North Indian'], landmark: 'Beside SBI ATM, Main Road', fee: { type: 'free_above', amount: 30, freeAboveValue: 199 }, minOrder: 100 },
  { name: 'Spice Route Kitchen', cuisines: ['North Indian', 'Mughlai'], landmark: 'Near Water Tank Junction', fee: { type: 'flat', amount: 35 }, minOrder: 149 },
  { name: 'Coastal Andhra Delights', cuisines: ['South Indian', 'Street Food'], landmark: 'Opposite Government School', fee: { type: 'distance_based', perKm: 8 }, minOrder: 120 },
  { name: 'Punjabi Rasoi', cuisines: ['North Indian'], landmark: 'Next to Axis Bank', fee: { type: 'flat', amount: 30 }, minOrder: 100 },
  { name: 'The Biryani House', cuisines: ['Mughlai', 'North Indian'], landmark: 'Near Bus Stop', fee: { type: 'free_above', amount: 25, freeAboveValue: 249 }, minOrder: 150 },
  { name: 'Sai Ram Bhojanalayam', cuisines: ['South Indian'], landmark: 'Beside Sai Baba Temple', fee: { type: 'flat', amount: 20 }, minOrder: 60 },
  { name: 'Grand Sweets & Snacks', cuisines: ['Desserts', 'Bakery', 'Street Food'], landmark: 'Main Road, opposite bus stand', fee: { type: 'flat', amount: 20 }, minOrder: 50 },
  { name: 'Hotel Kamat', cuisines: ['South Indian', 'North Indian'], landmark: 'Near Railway Gate', fee: { type: 'distance_based', perKm: 7 }, minOrder: 100 },
  { name: 'Udupi Grand', cuisines: ['South Indian'], landmark: 'Opposite Petrol Pump', fee: { type: 'free_above', amount: 20, freeAboveValue: 149 }, minOrder: 80 },
  { name: 'Chinese Wok Express', cuisines: ['Chinese', 'Fast Food'], landmark: 'Beside HDFC Bank ATM', fee: { type: 'flat', amount: 30 }, minOrder: 120 },
  { name: 'Tandoor Nights', cuisines: ['North Indian', 'Mughlai'], landmark: 'Near Community Hall', fee: { type: 'flat', amount: 35 }, minOrder: 150 },
  { name: 'Green Leaf Vegetarian', cuisines: ['South Indian', 'Healthy'], landmark: 'Opposite Park Gate', fee: { type: 'free_above', amount: 15, freeAboveValue: 129 }, minOrder: 60 },
  { name: 'Deccan Dum Biryani', cuisines: ['Mughlai'], landmark: 'Near Mosque Junction', fee: { type: 'flat', amount: 30 }, minOrder: 130 },
  { name: 'Café Continental', cuisines: ['Continental', 'Beverages', 'Fast Food'], landmark: 'Beside ICICI Bank', fee: { type: 'distance_based', perKm: 9 }, minOrder: 100 },
  { name: 'Milan Family Restaurant', cuisines: ['North Indian', 'Chinese'], landmark: 'Near Water Tank', fee: { type: 'flat', amount: 25 }, minOrder: 100 },
  { name: 'Amma Kitchen', cuisines: ['South Indian', 'Street Food'], landmark: 'Opposite Milk Dairy', fee: { type: 'free_above', amount: 20, freeAboveValue: 179 }, minOrder: 70 },
];

/* ── The menu, unchanged from `seed-food-menu.js` ─────────────────────── */
const V = 'veg';
const N = 'non-veg';
const E = 'egg';

const MENU = [
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
  { name: 'South Indian Veg Thali', search: 'South Indian thali', cat: 'Lunch Thalis', price: 140, veg: V, spice: 'medium', serves: 1, kcal: 780, prep: 15, tags: ['Bestseller'], allergens: ['Dairy'], desc: 'Rice, sambar, rasam, two vegetables, curd, pickle, papad and a sweet.', variants: [['Regular', 140], ['Full meals', 180]], addOns: [['Extra rice', 25], ['Extra curd', 20]] },
  { name: 'Paneer Butter Masala Thali', search: 'Paneer butter masala', cat: 'Lunch Thalis', price: 190, veg: V, spice: 'mild', serves: 1, kcal: 860, prep: 20, tags: ["Chef's Special"], allergens: ['Dairy', 'Nuts', 'Gluten'], desc: 'Paneer in a tomato-cashew gravy with two rotis, jeera rice and salad.', variants: [], addOns: [['Extra roti', 15], ['Butter naan', 45]] },
  { name: 'Hyderabadi Chicken Biryani', search: 'Hyderabadi biryani', cat: 'Lunch Thalis', price: 220, offer: 189, veg: N, spice: 'hot', serves: 1, kcal: 940, prep: 25, tags: ['Bestseller', 'Must Try'], allergens: ['Dairy'], desc: 'Long-grain rice dum-cooked with marinated chicken, served with raita and salan.', variants: [['Single', 220], ['Family pack', 620]], addOns: [['Extra raita', 30], ['Mirchi ka salan', 40], ['Boiled egg', 20]] },
  { name: 'Vegetable Dum Biryani', search: 'Vegetable biryani', cat: 'Lunch Thalis', price: 170, veg: V, spice: 'medium', serves: 1, kcal: 720, prep: 22, tags: [], allergens: ['Dairy'], desc: 'Seasonal vegetables layered with saffron rice and slow-cooked under dough.', variants: [['Single', 170], ['Family pack', 480]], addOns: [['Extra raita', 30]] },
  { name: 'Egg Biryani', search: 'Egg biryani', cat: 'Lunch Thalis', price: 160, veg: E, spice: 'medium', serves: 1, kcal: 700, prep: 20, tags: [], allergens: ['Egg', 'Dairy'], desc: 'Dum biryani with two whole spiced eggs folded through the rice.', variants: [], addOns: [['Extra egg', 20]] },
  { name: 'Curd Rice', search: 'Curd rice', cat: 'Lunch Thalis', price: 70, veg: V, spice: 'none', serves: 1, kcal: 340, prep: 8, tags: [], allergens: ['Dairy'], desc: 'Soft rice folded into set curd, tempered with mustard, curry leaf and ginger.', variants: [], addOns: [['Pickle', 10]] },
  { name: 'Rajma Chawal', search: 'Rajma chawal', cat: 'Lunch Thalis', price: 130, veg: V, spice: 'medium', serves: 1, kcal: 650, prep: 18, tags: [], allergens: [], desc: 'Kidney beans simmered in an onion-tomato masala over steamed rice.', variants: [], addOns: [['Papad', 10]] },
  { name: 'Dal Fry with Rice', search: 'Dal curry with naan and rice', cat: 'Lunch Thalis', price: 110, veg: V, spice: 'mild', serves: 1, kcal: 560, prep: 15, tags: [], allergens: ['Dairy'], desc: 'Yellow dal tempered with cumin, garlic and ghee, with steamed rice.', variants: [], addOns: [['Extra rice', 25]] },
  { name: 'Egg Curry with Rice', search: 'Egg curry', cat: 'Lunch Thalis', price: 140, veg: E, spice: 'hot', serves: 1, kcal: 620, prep: 18, tags: [], allergens: ['Egg'], desc: 'Two boiled eggs in a peppery Andhra gravy, with rice.', variants: [], addOns: [['Extra egg', 20]] },
  { name: 'Punjabi Samosa', search: 'Punjabi samosa', cat: 'Snacks & Chaat', price: 25, veg: V, spice: 'medium', serves: 1, kcal: 260, prep: 5, tags: ['Bestseller'], allergens: ['Gluten'], desc: 'Flaky pastry filled with spiced potato and peas, with tamarind chutney.', variants: [['1 piece', 25], ['2 pieces', 45]], addOns: [['Chutney cup', 10]] },
  { name: 'Mirchi Bajji', search: 'Mirchi bajji', cat: 'Snacks & Chaat', price: 40, veg: V, spice: 'hot', serves: 1, kcal: 300, prep: 10, tags: ['Spicy'], allergens: [], desc: 'Large green chillies stuffed, dipped in gram flour and fried to order.', variants: [['2 pieces', 40], ['4 pieces', 75]], addOns: [] },
  { name: 'Vada Pav', search: 'Vada pav', cat: 'Snacks & Chaat', price: 35, veg: V, spice: 'hot', serves: 1, kcal: 320, prep: 7, tags: [], allergens: ['Gluten'], desc: 'Potato vada in a soft pav with dry garlic chutney and a fried chilli.', variants: [], addOns: [['Extra chutney', 8]] },
  { name: 'Pav Bhaji', search: 'Pav bhaji', cat: 'Snacks & Chaat', price: 110, veg: V, spice: 'medium', serves: 1, kcal: 640, prep: 15, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Mashed vegetable bhaji finished with butter, two buttered pavs alongside.', variants: [['Regular', 110], ['Extra butter', 130]], addOns: [['Extra pav', 20], ['Cheese', 30]] },
  { name: 'Pani Puri', search: 'Pani puri', cat: 'Snacks & Chaat', price: 50, veg: V, spice: 'hot', serves: 1, kcal: 230, prep: 6, tags: [], allergens: ['Gluten'], desc: 'Six crisp puris with spiced potato and chilled mint water.', variants: [['6 pieces', 50], ['10 pieces', 80]], addOns: [] },
  { name: 'Bombay Grilled Sandwich', search: 'Bombay sandwich', cat: 'Snacks & Chaat', price: 80, veg: V, spice: 'mild', serves: 1, kcal: 420, prep: 10, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Layered potato, beetroot and cucumber with chutney, pressed and grilled.', variants: [['Plain', 80], ['Cheese', 110]], addOns: [['Extra cheese', 30]] },
  { name: 'Cheese Maggi', search: 'Maggi instant noodles cooked', cat: 'Snacks & Chaat', price: 70, veg: V, spice: 'mild', serves: 1, kcal: 400, prep: 8, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Masala noodles cooked soft with onion, tomato and a slice of cheese.', variants: [['Plain', 55], ['Cheese', 70], ['Double cheese', 90]], addOns: [['Boiled egg', 20]] },
  { name: 'Chicken 65', search: 'Chicken 65', cat: 'Snacks & Chaat', price: 180, veg: N, spice: 'hot', serves: 2, kcal: 520, prep: 18, tags: ["Chef's Special", 'Spicy'], allergens: ['Dairy'], desc: 'Boneless chicken marinated in curd and chilli, fried with curry leaf.', variants: [['Half', 180], ['Full', 320]], addOns: [['Onion salad', 15]] },
  { name: 'Gobi Manchurian', search: 'Gobi Manchurian', cat: 'Snacks & Chaat', price: 130, veg: V, spice: 'hot', serves: 2, kcal: 480, prep: 16, tags: [], allergens: ['Gluten', 'Soy'], desc: 'Cauliflower florets tossed in a garlic, soy and chilli sauce.', variants: [['Dry', 130], ['Gravy', 145]], addOns: [] },
  { name: 'Butter Chicken', search: 'Butter chicken', cat: 'Dinner Curries', price: 260, offer: 235, veg: N, spice: 'mild', serves: 2, kcal: 780, prep: 22, tags: ['Bestseller'], allergens: ['Dairy', 'Nuts'], desc: 'Tandoori chicken finished in a tomato, butter and cream gravy.', variants: [['Half', 260], ['Full', 460]], addOns: [['Butter naan', 45], ['Jeera rice', 90]] },
  { name: 'Andhra Chicken Curry', search: 'Chicken curry', cat: 'Dinner Curries', price: 240, veg: N, spice: 'hot', serves: 2, kcal: 690, prep: 25, tags: ['Spicy'], allergens: [], desc: 'Bone-in chicken in a dark roasted-spice gravy, hot the way the coast makes it.', variants: [['Half', 240], ['Full', 430]], addOns: [['Extra gravy', 30]] },
  { name: 'Mutton Rogan Josh', search: 'Rogan josh', cat: 'Dinner Curries', price: 320, veg: N, spice: 'medium', serves: 2, kcal: 820, prep: 35, tags: [], allergens: ['Dairy'], desc: 'Slow-cooked mutton on the bone in a Kashmiri chilli and yoghurt gravy.', variants: [], addOns: [['Extra gravy', 40]] },
  { name: 'Fish Fry, Coastal Style', search: 'Fish fry Indian', cat: 'Dinner Curries', price: 230, veg: N, spice: 'hot', serves: 1, kcal: 430, prep: 20, tags: [], allergens: ['Shellfish'], desc: 'Whole fish rubbed with chilli and turmeric, shallow-fried till the edges crisp.', variants: [], addOns: [['Lemon and onion', 10]] },
  { name: 'Paneer Butter Masala', search: 'Paneer butter masala', cat: 'Dinner Curries', price: 210, veg: V, spice: 'mild', serves: 2, kcal: 700, prep: 20, tags: ['Bestseller'], allergens: ['Dairy', 'Nuts'], desc: 'Cottage cheese cubes in a rich tomato and cashew gravy.', variants: [['Half', 210], ['Full', 370]], addOns: [['Butter naan', 45]] },
  { name: 'Chole Bhature', search: 'Chole bhature', cat: 'Dinner Curries', price: 150, veg: V, spice: 'medium', serves: 1, kcal: 810, prep: 18, tags: [], allergens: ['Gluten'], desc: 'Spiced chickpeas with two puffed bhature, onion and pickle.', variants: [], addOns: [['Extra bhatura', 35]] },
  { name: 'Tandoori Chicken', search: 'Tandoori chicken', cat: 'Dinner Curries', price: 290, veg: N, spice: 'medium', serves: 2, kcal: 560, prep: 28, tags: ["Chef's Special"], allergens: ['Dairy'], desc: 'Half bird marinated overnight in yoghurt and spice, cooked in the tandoor.', variants: [['Half', 290], ['Full', 540]], addOns: [['Mint chutney', 15]] },
  { name: 'Dal Tadka', search: 'Dal tadka', cat: 'Dinner Curries', price: 120, veg: V, spice: 'mild', serves: 2, kcal: 380, prep: 15, tags: [], allergens: ['Dairy'], desc: 'Yellow lentils under a hot tempering of ghee, garlic and dried chilli.', variants: [], addOns: [] },
  { name: 'Butter Naan', search: 'Butter naan', cat: 'Breads', price: 45, veg: V, spice: 'none', serves: 1, kcal: 260, prep: 8, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Leavened flatbread from the tandoor, brushed with butter.', variants: [['Plain', 35], ['Butter', 45], ['Garlic', 55]], addOns: [] },
  { name: 'Tandoori Roti', search: 'Tandoori roti', cat: 'Breads', price: 25, veg: V, spice: 'none', serves: 1, kcal: 150, prep: 7, tags: [], allergens: ['Gluten'], desc: 'Wholewheat roti cooked against the wall of the tandoor.', variants: [['Plain', 25], ['Butter', 35]], addOns: [] },
  { name: 'Paneer Paratha', search: 'Paneer paratha', cat: 'Breads', price: 90, veg: V, spice: 'mild', serves: 1, kcal: 470, prep: 15, tags: [], allergens: ['Gluten', 'Dairy'], desc: 'Stuffed with crumbled paneer, green chilli and coriander.', variants: [], addOns: [['Curd bowl', 20]] },
  { name: 'Veg Fried Rice', search: 'Vegetable fried rice', cat: 'Chinese', price: 120, veg: V, spice: 'medium', serves: 1, kcal: 590, prep: 14, tags: [], allergens: ['Soy'], desc: 'Rice tossed hard over flame with spring onion, carrot and cabbage.', variants: [['Veg', 120], ['Egg', 140], ['Chicken', 165]], addOns: [['Extra sauce', 10]] },
  { name: 'Hakka Noodles', search: 'Hakka noodles', cat: 'Chinese', price: 125, veg: V, spice: 'medium', serves: 1, kcal: 610, prep: 14, tags: [], allergens: ['Gluten', 'Soy'], desc: 'Wheat noodles stir-fried with shredded vegetables and dark soy.', variants: [['Veg', 125], ['Egg', 145], ['Chicken', 170]], addOns: [] },
  { name: 'Chilli Chicken', search: 'Chilli chicken Indian', cat: 'Chinese', price: 190, veg: N, spice: 'hot', serves: 2, kcal: 540, prep: 18, tags: ['Spicy'], allergens: ['Soy', 'Gluten'], desc: 'Battered chicken tossed with capsicum, onion and green chilli.', variants: [['Dry', 190], ['Gravy', 205]], addOns: [] },
  { name: 'Veg Spring Rolls', search: 'Vegetable spring roll', cat: 'Chinese', price: 100, veg: V, spice: 'mild', serves: 1, kcal: 350, prep: 12, tags: [], allergens: ['Gluten', 'Soy'], desc: 'Four crisp rolls packed with cabbage and carrot, sweet chilli dip.', variants: [], addOns: [] },
  { name: 'Chicken Manchurian', search: 'Gobi Manchurian dish', cat: 'Chinese', price: 185, veg: N, spice: 'hot', serves: 2, kcal: 570, prep: 18, tags: [], allergens: ['Soy', 'Gluten'], desc: 'Chicken dumplings in a garlic, ginger and soy gravy.', variants: [['Dry', 185], ['Gravy', 200]], addOns: [] },
  { name: 'Gulab Jamun', search: 'Gulab jamun', cat: 'Desserts', price: 60, veg: V, spice: 'none', serves: 1, kcal: 380, prep: 5, tags: ['Bestseller'], allergens: ['Dairy', 'Gluten'], desc: 'Two warm milk-solid dumplings soaked in cardamom syrup.', variants: [['2 pieces', 60], ['4 pieces', 110]], addOns: [] },
  { name: 'Rasmalai', search: 'Ras malai', cat: 'Desserts', price: 80, veg: V, spice: 'none', serves: 1, kcal: 340, prep: 5, tags: [], allergens: ['Dairy', 'Nuts'], desc: 'Chilled paneer discs in saffron milk, topped with pistachio.', variants: [], addOns: [] },
  { name: 'Rice Kheer', search: 'Rice kheer', cat: 'Desserts', price: 70, veg: V, spice: 'none', serves: 1, kcal: 320, prep: 6, tags: [], allergens: ['Dairy', 'Nuts'], desc: 'Rice slow-cooked in milk with cardamom, raisin and almond.', variants: [], addOns: [] },
  { name: 'Filter Coffee', search: 'Indian filter coffee', cat: 'Beverages', price: 30, veg: V, spice: 'none', serves: 1, kcal: 90, prep: 5, tags: ['Bestseller'], allergens: ['Dairy'], desc: 'Decoction and hot milk, pulled between tumbler and dabarah.', variants: [['Regular', 30], ['Strong', 35]], addOns: [] },
  { name: 'Masala Chai', search: 'Masala chai', cat: 'Beverages', price: 25, veg: V, spice: 'mild', serves: 1, kcal: 80, prep: 5, tags: [], allergens: ['Dairy'], desc: 'Boiled with ginger, cardamom and clove until the milk turns.', variants: [['Regular', 25], ['Large', 35]], addOns: [] },
  { name: 'Sweet Lassi', search: 'Lassi', cat: 'Beverages', price: 60, veg: V, spice: 'none', serves: 1, kcal: 240, prep: 5, tags: [], allergens: ['Dairy'], desc: 'Thick set curd blended with sugar and a pinch of cardamom.', variants: [['Sweet', 60], ['Salted', 55], ['Mango', 75]], addOns: [] },
];

/* ── Photographs — identical machinery to `seed-food-menu.js` ───────────── */
const UA = 'LamposeFoodSeed/1.0 (https://lampose.com; dev@lampose.in)';

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} fetching the image`);
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`not an image (${type})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${type};base64,${buffer.toString('base64')}`;
}

const NOT_FOOD = [
  'flag', 'map', 'coat of arms', 'stamp', 'logo', 'poster', 'portrait', 'lady',
  'noble', 'emperor', 'temple', 'building', 'railway', 'station', 'street',
  'festival', 'wikipedia', 'diagram', 'chart', 'banknote', 'coin', 'monument',
];
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
  if (!words.length) return false;
  return words.some((word) => name.includes(word));
}

async function findPhoto(term) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `filetype:bitmap ${term}`, gsrlimit: '4', gsrnamespace: '6',
    prop: 'imageinfo', iiprop: 'url', iiurlwidth: '1000',
  }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const pages = Object.values(json?.query?.pages ?? {});
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

const pairs = (rows) => rows.map(([name, price]) => ({ name, price }));

/* ── Run ───────────────────────────────────────────────────────────────── */
(async () => {
  await connectDB().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable. Start it and re-run.\n');
    process.exit(2);
  }

  const already = await FoodRestaurant.find({ ownerPhone: { $in: REAL_NUMBERS } })
    .select('restaurantId restaurantName ownerPhone')
    .lean();
  console.log('Already using the given numbers as ownerPhone:');
  already.forEach((r) => console.log(`  ${r.restaurantName} (${r.restaurantId}) — ${r.ownerPhone}`));
  const takenNumbers = new Set(already.map((r) => r.ownerPhone));
  const spareRealNumber = REAL_NUMBERS.find((n) => !takenNumbers.has(n));
  console.log(spareRealNumber ? `Spare real number for a new owner: ${spareRealNumber}` : 'All three numbers are already owners.');

  const profiles = PROFILES.slice(0, COUNT);
  console.log(`\nCreating ${profiles.length} new restaurant(s), ${MENU.length} dishes each.\n`);

  const haveCloudinary = cloudinaryReady();
  if (!haveCloudinary) console.log('CLOUDINARY_* is not set — dishes will be written without photographs.\n');

  /* Photos, once, shared across every new restaurant. */
  const photoByDish = new Map();
  let withPhoto = 0;
  if (haveCloudinary) {
    const folder = 'lampose/food-partners/_seed-menu-shared';
    for (let i = 0; i < MENU.length; i += 1) {
      const item = MENU[i];
      try {
        const source = await findPhoto(item.search);
        if (source) {
          const bytes = await download(source);
          const uploaded = await cloudinary.uploader.upload(bytes, {
            folder, resource_type: 'image',
            transformation: [{ width: 1000, height: 750, crop: 'fill', gravity: 'auto', quality: 'auto' }],
          });
          photoByDish.set(item.name, { url: uploaded.secure_url, publicId: uploaded.public_id });
          withPhoto += 1;
        }
      } catch (error) {
        console.log(`  x photo for ${item.name} (${error.message})`);
      }
      process.stdout.write(`\r  photos  ${i + 1}/${MENU.length}`);
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    process.stdout.write('\n');
    console.log(`${withPhoto}/${MENU.length} dishes have a shared photograph.\n`);
  }

  const created = [];
  let numberCursor = 0;
  const nextContactNumber = () => {
    const n = REAL_NUMBERS[numberCursor % REAL_NUMBERS.length];
    numberCursor += 1;
    return n;
  };

  for (let i = 0; i < profiles.length; i += 1) {
    const profile = profiles[i];
    const restaurantId = makeRestaurantId();
    const ownerPhone = i === 0 && spareRealNumber ? spareRealNumber : `+91900000${String(1000 + i).slice(-4)}`;
    const slug = profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const ownerEmail = `${slug}@lampose-seed.test`;
    const contactNumber = nextContactNumber();
    const [lng, lat] = jitter(i + 1);

    const restaurantDoc = {
      restaurantId,
      restaurantName: profile.name,
      ownerName: `${profile.name} Owner`,
      ownerPhone,
      ownerEmail,
      passwordHash: await hashPassword(TEST_PASSWORD),
      description: `${profile.cuisines.join(', ')} near ${profile.landmark}.`,
      cuisineTypes: profile.cuisines,
      fssaiLicenseNumber: `11525${String(1000000 + i).padStart(8, '0')}`,
      address: {
        line1: `${10 + i}-${100 + i}, Main Road`,
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500055',
        landmark: profile.landmark,
      },
      location: { type: 'Point', coordinates: [lng, lat] },
      contactNumber,
      openingHours: OPENING_HOURS,
      openState: 'auto',
      avgPreparationTime: 20 + (i % 4) * 5,
      deliveryRadiusKm: 5,
      minOrderValue: profile.minOrder,
      packagingCharge: [0, 10, 15, 20][i % 4],
      deliveryFee: {
        type: profile.fee.type,
        amount: profile.fee.amount || 0,
        perKm: profile.fee.perKm || 0,
        freeAboveValue: profile.fee.freeAboveValue || 0,
      },
      acceptsOnlinePayment: true,
      acceptsCod: true,
      verificationStatus: 'approved',
      verifiedAt: new Date(),
      isActive: true,
      contract: { accepted: true, signature: `${profile.name} Owner`, acceptedAt: new Date(), commission: 15, platformFee: 0 },
      partnerType: 'food',
    };

    if (!DRY) {
      await FoodRestaurant.create(restaurantDoc);
      const docs = MENU.map((item, order) => ({
        productId: makeProductId(),
        restaurantId,
        productName: item.name,
        description: item.desc,
        category: item.cat,
        price: item.price,
        discountedPrice: item.offer ?? null,
        isVeg: item.veg,
        isAvailable: true,
        productImage: photoByDish.get(item.name),
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
      }));
      await FoodProduct.insertMany(docs);
    }

    created.push({ restaurantId, name: profile.name, ownerPhone, contactNumber });
    console.log(`  ${DRY ? '(dry) ' : ''}${profile.name}  (${restaurantId})  owner:${ownerPhone}  calls:${contactNumber}`);
  }

  /* Give the two pre-existing restaurants a reachable contact number too,
     if they do not already have one — never overwriting a real value. */
  const existingBlank = await FoodRestaurant.find({ contactNumber: { $in: ['', null] } })
    .select('restaurantId restaurantName');
  for (const r of existingBlank) {
    const num = nextContactNumber();
    console.log(`\nExisting "${r.restaurantName}" (${r.restaurantId}) has no contactNumber — setting it to ${num}.`);
    if (!DRY) {
      r.contactNumber = num;
      await r.save();
    }
  }

  console.log(`\n${'─'.repeat(64)}`);
  console.log(DRY ? 'DRY RUN — nothing was written' : `Created ${created.length} restaurants, ${created.length * MENU.length} dishes.`);
  console.log(`Total restaurants now: ${(await FoodRestaurant.countDocuments())}`);
  console.log(`${'─'.repeat(64)}\n`);

  await closeConnections().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
})();

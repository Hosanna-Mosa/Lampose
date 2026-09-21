/* ══════════════════════════════════════════════════════════════════════════
   Give every restaurant a cover photograph.

     npm run backfill:food-covers
     npm run backfill:food-covers -- --dry     -- resolve and print, write nothing
     npm run backfill:food-covers -- --force   -- replace covers that already exist

   ## Why this exists

   `seed-food-restaurants.js` resolved and uploaded a photograph per DISH
   (`productImage`) and none per RESTAURANT. `food_restaurants` carries two
   image fields — `logoImage` and `coverBannerImage` — and the User App reads
   `coverBannerImage` first, falling back to `logoImage`
   (`services/adapters/food.adapter.ts`). With neither set, every kitchen card
   on Food Home renders its empty state, which is what the whole listing grid
   was showing: fifteen identical placeholder tiles.

   So this is a backfill, not a second seeder. It touches ONE field on rows
   that already exist and creates nothing.

   ## Where the photographs come from

   The same machinery as the two food seeders: a Wikimedia Commons search,
   downloaded and re-uploaded to Cloudinary so the app is never hot-linking
   somebody else's server. Commons is used because its images are freely
   licensed — a stock-photo hot-link would be both fragile and a licence
   problem the day this stops being a dev database.

   ## Why the search term comes from `cuisineTypes`

   A cover is meant to look like what the kitchen cooks, and `cuisineTypes` is
   the only field on the document that says so. A restaurant NAME is a poor
   search term — "Udupi Grand" and "Hotel Kamat" return hotels and buildings,
   not food, which is exactly what `looksRight`'s `NOT_FOOD` list exists to
   reject.

   Two kitchens sharing a cuisine must not share a photograph, or the grid
   looks broken in a new way. `findPhoto` therefore takes an OFFSET and every
   repeat of a cuisine walks one result further down the Commons page, with a
   set of already-used URLs as the backstop.
   ══════════════════════════════════════════════════════════════════════════ */

const cloudinary = require('cloudinary').v2;

require('../src/config/env');
const { connectDB, closeConnections, isLamposeUp } = require('../src/infrastructure/database/db');
const FoodRestaurant = require('../src/modules/foodpartners/foodRestaurant.model');

/* Refuse to run against production. See src/infrastructure/database/guard.js */
require('../src/infrastructure/database/guard').assertDevTargetOrExit();


const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const DRY = flag('dry');
const FORCE = flag('force');

/* ── Photographs — same helpers as `seed-food-restaurants.js` ───────────── */
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
  'noble', 'emperor', 'temple', 'building', 'railway', 'station', 'street sign',
  'festival', 'wikipedia', 'diagram', 'chart', 'banknote', 'coin', 'monument',
  'hotel', 'facade', 'signboard', 'menu card',
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

/**
 * The `skip`th acceptable Commons result for `term`, rather than the first.
 *
 * `gsrlimit` is 10 here where the seeders ask for 4: this walks DOWN the list
 * once per repeat of a cuisine, and a four-deep page runs out by the fourth
 * South Indian kitchen. `used` is the backstop for when two different terms
 * resolve to the same file anyway.
 */
async function findPhoto(term, skip = 0, used = new Set()) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `filetype:bitmap ${term}`, gsrlimit: '10', gsrnamespace: '6',
    prop: 'imageinfo', iiprop: 'url', iiurlwidth: '1400',
  }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const json = await res.json();
  const pages = Object.values(json?.query?.pages ?? {});
  const ordered = pages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const matches = [];
  for (const page of ordered) {
    const thumb = page?.imageinfo?.[0]?.thumburl;
    if (!thumb) continue;
    const clean = String(thumb).split('?')[0];
    if (looksRight(clean, term) && !used.has(clean)) matches.push(clean);
  }
  if (!matches.length) return null;
  /* Wraps rather than giving up: a sixth Chinese kitchen repeating the first
     one's photograph is a far better outcome than a sixth empty tile. */
  return matches[skip % matches.length];
}

const cloudinaryReady = () => {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return false;
  cloudinary.config({ cloud_name, api_key, api_secret });
  return true;
};

/**
 * What to go looking for, per cuisine tag.
 *
 * Deliberately a picture of the FOOD rather than of a restaurant: a cover is
 * the one image a diner uses to decide whether they are hungry for this
 * kitchen, and a photograph of a shopfront answers a different question.
 */
const BY_CUISINE = {
  'south indian': 'South Indian thali meal',
  'north indian': 'North Indian curry',
  mughlai: 'Mughlai biryani',
  biryani: 'Hyderabadi biryani',
  chinese: 'Hakka noodles',
  'fast food': 'Burger and fries',
  desserts: 'Indian sweets mithai',
  bakery: 'Bakery bread loaf',
  'street food': 'Chaat street food',
  beverages: 'Masala chai',
  healthy: 'Salad bowl vegetables',
  continental: 'Pasta',
  italian: 'Pizza',
  seafood: 'Fish curry',
  tandoor: 'Tandoori chicken',
  bbq: 'Tandoori chicken',
  andhra: 'Andhra meals',
  kerala: 'Kerala sadya',
  punjabi: 'Punjabi thali',
  rolls: 'Kathi roll',
  pizza: 'Pizza',
  burger: 'Burger',
};
/* Used when a kitchen carries no cuisine tag this map knows. Not a failure —
   a plate of Indian food is a true thing to show for any of these kitchens. */
const FALLBACK = 'Indian food thali';

const termFor = (cuisines) => {
  for (const raw of cuisines ?? []) {
    const hit = BY_CUISINE[String(raw).trim().toLowerCase()];
    if (hit) return hit;
  }
  return FALLBACK;
};

/* ── Run ───────────────────────────────────────────────────────────────── */
(async () => {
  await connectDB().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1500));

  if (!isLamposeUp()) {
    console.log('\nMongoDB is not reachable. Start it and re-run.\n');
    process.exit(2);
  }

  const all = await FoodRestaurant.find({})
    .select('restaurantId restaurantName cuisineTypes coverBannerImage logoImage verificationStatus isActive')
    .lean();

  const missing = all.filter((r) => FORCE || !r.coverBannerImage?.url);
  console.log(`\n${all.length} restaurant(s); ${all.length - missing.length} already have a cover.`);
  if (!missing.length) {
    console.log('Nothing to do.\n');
    await closeConnections();
    process.exit(0);
  }
  console.log(`${missing.length} to ${FORCE ? 'replace' : 'fill'}.\n`);

  const haveCloudinary = cloudinaryReady();
  if (!haveCloudinary && !DRY) {
    console.log('CLOUDINARY_* is not set — cannot upload. Re-run with --dry to see the plan.\n');
    await closeConnections();
    process.exit(2);
  }

  const folder = 'lampose/food-partners/_seed-covers';
  const usedUrls = new Set(all.map((r) => r.coverBannerImage?.url).filter(Boolean));
  const seenTerm = new Map();
  let filled = 0;
  const failures = [];

  for (const restaurant of missing) {
    const term = termFor(restaurant.cuisineTypes);
    const skip = seenTerm.get(term) ?? 0;
    seenTerm.set(term, skip + 1);

    const label = `${restaurant.restaurantName || restaurant.restaurantId}`;
    try {
      const source = await findPhoto(term, skip, usedUrls);
      if (!source) {
        failures.push(`${label} — nothing on Commons for "${term}"`);
        console.log(`  x ${label.padEnd(28)} "${term}" — no usable result`);
      } else if (DRY) {
        usedUrls.add(source);
        console.log(`  · ${label.padEnd(28)} "${term}" -> ${readableName(source)}`);
        filled += 1;
      } else {
        const bytes = await download(source);
        const uploaded = await cloudinary.uploader.upload(bytes, {
          folder,
          resource_type: 'image',
          /* 16:9 and wide: this one file is read by the 2-column grid tile on
             Food Home AND by the kitchen screen's header, and the wider of the
             two is what must not be letterboxed. `gravity: auto` keeps the
             food in frame when the crop bites. */
          transformation: [{ width: 1400, height: 788, crop: 'fill', gravity: 'auto', quality: 'auto' }],
        });
        await FoodRestaurant.updateOne(
          { _id: restaurant._id },
          { $set: { coverBannerImage: { url: uploaded.secure_url, publicId: uploaded.public_id } } },
        );
        usedUrls.add(source);
        filled += 1;
        console.log(`  ✓ ${label.padEnd(28)} "${term}"`);
      }
    } catch (error) {
      failures.push(`${label} — ${error.message}`);
      console.log(`  x ${label.padEnd(28)} ${error.message}`);
    }
    /* Commons asks for courtesy, and this is a one-off backfill — there is no
       reason to be quick about it. */
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  console.log(`\n${filled}/${missing.length} ${DRY ? 'resolved (nothing written)' : 'now have a cover'}.`);
  if (failures.length) {
    console.log('\nStill without one:');
    failures.forEach((f) => console.log(`  ${f}`));
    console.log('\nRe-running is safe — it only touches rows that are still empty.');
  }
  console.log('');

  await closeConnections();
  process.exit(0);
})();

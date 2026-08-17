/* Read-only view of the `properties` collection, shaped for lampose.com's
   public Explore page. Writes go through the property controllers instead. */
const Property = require('../properties/property.model');
const {
  formatListing, cityOf, localityOf, isDaily,
} = require('./listing.formatter');
const { escapeRegex } = require('../../shared/utils/text');

// @route   GET /api/v2/listings
// @desc    Every listing, newest first, with optional filtering
// @access  Public
const getListings = async (req, res, next) => {
  try {
    const {
      category, city, locality, maxPrice, search,
    } = req.query;
    const filter = {};

    /*
     * One category, or several separated by commas.
     *
     * The comma form is what the mobile app needs. Its tabs are not this
     * collection's categories: "PG / Hostel" is one tab covering two enum
     * values, because a student looking for a bed does not distinguish them
     * and both price the same way. A single-value filter forced that tab to
     * either fetch the whole collection and narrow it on the phone, or ask
     * twice and stitch the answers — so the list form is accepted here,
     * where the query already lives.
     *
     * Still a regex per value rather than a plain $in: the original
     * behaviour was case-insensitive and a deployment calling `?category=pg`
     * has been getting PGs back for as long as this endpoint has existed.
     */
    if (category && category !== 'all') {
      const wanted = String(category)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => new RegExp(`^${escapeRegex(value)}$`, 'i'));

      if (wanted.length === 1) {
        /* Unanchored, as it always was. `?category=Bachelor` matching
           "Bachelor Room" is behaviour the website relies on. */
        filter.category = new RegExp(escapeRegex(String(category).trim()), 'i');
      } else if (wanted.length > 1) {
        filter.category = { $in: wanted };
      }
    }

    if (maxPrice && Number.isFinite(Number(maxPrice))) {
      filter.rent = { $lte: Number(maxPrice) };
    }

    if (search) {
      const term = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: term },
        { place: term },
        { ownerName: term },
        { amenities: term },
      ];
    }

    /* No limit: the Explore page is the only consumer and it pages the render
       itself, so the response is the whole collection. */
    const properties = await Property.find(filter).sort({ createdAt: -1 }).lean();
    let listings = properties.map(formatListing);

    /* City and locality are both derived from free-text `place` after the
       fact, so neither can be part of the database query. */
    if (city && city !== 'All Cities') {
      listings = listings.filter((item) => item.city.toLowerCase() === String(city).toLowerCase());
    }

    /*
     * The AREA, not the city.
     *
     * Added because the two were being confused, with a visible cost: the
     * mobile app's entry screen offers areas ("HSR Layout Sector 1") and
     * states how many places each holds, and then asked for the feed by city.
     * A row promising one place led to a feed of three, spread across
     * Koramangala and both HSR sectors — the count looked broken when what
     * was actually wrong was the question the next screen asked.
     *
     * Matched against the same `localityOf` derivation the facets endpoint
     * groups by, so an area offered there always matches here. Exact rather
     * than partial: "HSR Layout Sector 1" must not pull in Sector 2.
     */
    if (locality) {
      const wanted = String(locality).trim().toLowerCase();
      listings = listings.filter((item) => String(item.locality).toLowerCase() === wanted);
    }

    return res.json({ success: true, count: listings.length, data: listings });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v2/listings/:id
// @desc    A single listing
// @access  Public
const getListingById = async (req, res, next) => {
  try {
    const { id } = req.params;

    /* findById on a non-ObjectId throws a CastError; checking the shape first
       lets a bad id be a plain 404 instead. */
    const property = /^[0-9a-fA-F]{24}$/.test(id)
      ? await Property.findById(id).lean()
      : null;

    if (!property) {
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Listing not found',
        error: 'Listing not found',
      });
    }

    return res.json({ success: true, data: formatListing(property) });
  } catch (error) {
    return next(error);
  }
};

/* ── Facets ────────────────────────────────────────────────────────────────
   What the clients need BEFORE they can ask for listings: which places we
   actually cover, which categories have anything in them, and what a place
   costs in each area.

   The mobile app is the reason this exists. Its first two screens ask "where
   are you looking?" and "what kind of place?", and both were answered from a
   hardcoded list of Hyderabad localities — so a student was offered
   Gachibowli and Ameerpet by an app whose database holds Anakapalli and HSR
   Layout. An area with nothing in it is a wasted tap; an area we cover that
   the list has never heard of is invisible.

   Derived from `place` through the same cityOf/localityOf the listing
   projection uses, so a locality offered here is spelled exactly as the
   `?city=` filter will match it. Two different derivations would let this
   screen offer a filter that returns nothing.
   ────────────────────────────────────────────────────────────────────────── */

/** The middle value, or the mean of the two middle ones. Null on nothing. */
const medianOf = (numbers) => {
  const sorted = numbers.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

// @route   GET /api/v2/listings/meta
// @desc    Cities, localities, categories and the rent range actually in stock
// @access  Public
const getListingMeta = async (req, res, next) => {
  try {
    /* Only the four fields the facets are built from. The full documents are
       what GET / already returns, and this endpoint is called on a screen
       that has no use for images or amenities. */
    /* `dailyPrice`, `monthlyPrice` and `categoryDetails` are here only so
       isDaily() can tell a nightly rate from a monthly one — see the median
       below. */
    const rows = await Property.find({}, {
      category: 1, place: 1, rent: 1, dailyPrice: 1, monthlyPrice: 1, categoryDetails: 1,
    }).lean();

    const byCity = new Map();
    const byLocality = new Map();
    const byCategory = new Map();
    const rents = [];

    for (const row of rows) {
      const place = String(row.place || '');
      const city = cityOf(place) || 'Unknown';
      const locality = localityOf(place, city) || city;

      /*
       * Only monthly rents reach a median.
       *
       * A dormitory quotes ₹450 a night and a PG ₹14,500 a month, and the
       * `rent` column holds both — so a straight median put "median rent
       * ₹450" beside an area whose one listing is a nightly dormitory bed.
       * On a screen whose entire purpose is "which area can I afford?", that
       * is off by a factor of thirty in the direction that makes somebody
       * choose an area they cannot afford.
       *
       * isDaily() is the formatter's own test, reused rather than
       * reimplemented, so this and the `/day` suffix on a card can never
       * disagree about which listings are nightly.
       */
      const rent = isDaily(row) ? 0 : Number(row.rent) || 0;
      if (rent > 0) rents.push(rent);

      const categoryName = row.category || 'PG';

      const cityEntry = byCity.get(city)
        || { name: city, count: 0, rents: [], categories: {} };
      cityEntry.count += 1;
      cityEntry.categories[categoryName] = (cityEntry.categories[categoryName] || 0) + 1;
      if (rent > 0) cityEntry.rents.push(rent);
      byCity.set(city, cityEntry);

      /* Keyed on city+locality: "Sector 1" in two cities is two places, and
         merging them would put one city's count on the other's row. */
      const key = `${city}::${locality}`;
      const localityEntry = byLocality.get(key)
        || {
          id: `loc-${slugify(city)}-${slugify(locality)}`,
          name: locality,
          city,
          count: 0,
          rents: [],
          /*
           * How the area's places break down by kind.
           *
           * Needed because the count beside an area is every kind of place in
           * it, while the feed behind it shows one tab. An area holding a
           * single bachelor room reads "1 place" and then, on the PG tab,
           * correctly shows none — and the screen that explains that has to
           * say how many OTHER kinds are there. Without this it could only
           * count across the whole catalogue, and would offer a student four
           * other places in an area that has one.
           */
          categories: {},
        };
      localityEntry.count += 1;
      localityEntry.categories[categoryName] = (localityEntry.categories[categoryName] || 0) + 1;
      if (rent > 0) localityEntry.rents.push(rent);
      byLocality.set(key, localityEntry);

      const categoryEntry = byCategory.get(categoryName)
        || { name: categoryName, slug: slugify(categoryName), count: 0 };
      categoryEntry.count += 1;
      byCategory.set(categoryName, categoryEntry);
    }

    /* Ordered by how much is in each, not alphabetically. The list is read
       top-down and the first rows should be the ones worth tapping. */
    const byVolume = (a, b) => b.count - a.count || a.name.localeCompare(b.name);

    return res.json({
      success: true,
      data: {
        total: rows.length,
        cities: [...byCity.values()]
          .map(({
            name, count, rents: cityRents, categories,
          }) => ({
            name, count, medianRent: medianOf(cityRents), categories,
          }))
          .sort(byVolume),
        localities: [...byLocality.values()]
          .map(({
            id, name, city, count, rents: localRents, categories,
          }) => ({
            id,
            name,
            city,
            listingCount: count,
            medianRent: medianOf(localRents),
            categories,
          }))
          .sort((a, b) => b.listingCount - a.listingCount || a.name.localeCompare(b.name)),
        categories: [...byCategory.values()].sort(byVolume),
        /* Named for what it is. `rent` invited a caller to compare it against
           a dormitory's nightly figure, which is the mistake this block was
           written to stop. Nightly listings are excluded here and every
           `medianRent` above. */
        monthlyRent: {
          min: rents.length ? Math.min(...rents) : null,
          max: rents.length ? Math.max(...rents) : null,
          median: medianOf(rents),
        },
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getListings, getListingById, getListingMeta };

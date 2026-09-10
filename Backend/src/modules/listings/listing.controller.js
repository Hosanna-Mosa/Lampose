/* Read-only view of the `properties` collection, shaped for lampose.com's
   public Explore page. Writes go through the property controllers instead. */
const Property = require('../properties/property.model');
const { DEFAULT_CATEGORY, normaliseCategory } = require('../../shared/constants/categories');
const {
  formatListing, ownerNamesFor, cityOf, localityOf, isDaily,
} = require('./listing.formatter');
const { escapeRegex } = require('../../shared/utils/text');
const { rowsFor } = require('../inventory/inventory.service');

// @route   GET /api/v2/listings
// @desc    Every listing, newest first, with optional filtering
// @access  Public
/**
 * Fold live bed counts onto already-formatted listings.
 *
 * `formatListing` is synchronous and pure — it takes one document and reads
 * nothing else — which is what lets the build-time snapshot in
 * scripts/export-listings.js produce the same shape as the live API. Beds are
 * the one fact that cannot work that way: they live in a different collection
 * and change several times a day. So they are folded on afterwards, in one
 * query for the whole page rather than one per listing.
 *
 * A listing whose options have no rows keeps `availableBeds: null` and
 * `requestable: false`. Null is not zero: it means nobody recorded a count,
 * which is true of every property onboarded before the field existed, and the
 * app says "call the owner" rather than "full".
 */
const withAvailability = async (listings) => {
  if (!listings.length) return listings;

  const rows = await rowsFor(listings.map((listing) => listing.id));
  if (!rows.size) {
    return listings.map((listing) => ({
      ...listing,
      sharingOptions: listing.sharingOptions.map((option) => ({
        ...option, availableBeds: null, requestable: false, reason: 'NO_INVENTORY_RECORDED',
      })),
      requestable: false,
    }));
  }

  return listings.map((listing) => {
    const options = listing.sharingOptions.map((option) => {
      const row = option.shareTypeId ? rows.get(option.shareTypeId) : null;
      if (!row) {
        return {
          ...option, availableBeds: null, requestable: false, reason: 'NO_INVENTORY_RECORDED',
        };
      }

      /*
       * WHY it cannot be requested, not just that it cannot.
       *
       * Three different situations end up here and they need three different
       * sentences on a listing page: nobody has recorded a count, the owner
       * has switched this room type off, and every bed is taken. Reporting
       * only `requestable: false` made the app say "live availability not
       * confirmed" about a room with six free beds that the owner had simply
       * paused — which is both wrong and unactionable.
       */
      const paused = row.isAvailable === false;
      const full = row.availableBeds <= 0;

      return {
        ...option,
        totalBeds: row.totalBeds,
        availableBeds: row.availableBeds,
        requestable: !paused && !full,
        /* The pause is reported ahead of the bed count on purpose: a room the
           owner switched off is not "full", and telling a student every bed
           is taken when six are free sends them away for the wrong reason. */
        reason: paused ? 'OWNER_PAUSED' : full ? 'NO_BEDS_FREE' : null,
      };
    });

    return {
      ...listing,
      sharingOptions: options,
      /* One flag the card can read without walking the options. A listing
         with nothing requestable is still REACHABLE by id — a saved listing
         or a shared link must not turn into a 404 — but its Send Request
         button is off. */
      requestable: options.some((option) => option.requestable),

      /*
       * The owner switched this listing OFF.
       *
       * True only when every room type we have a count for is paused — which
       * is exactly what the Stay Partner toggle does, since it writes
       * `isAvailable` to every share type of the property at once.
       *
       * A listing with no counts recorded at all is NOT paused. It is
       * unfinished, which is a different thing and must not be hidden: most
       * of the collection is in that state and hiding it would empty the app.
       */
      paused: ownerPaused(options),

      /*
       * SOME room type is paused, even though the listing as a whole is not.
       *
       * Not hidden — the listing may still have other rooms open — but the
       * owner has told us to stop sending people at least one of them, and a
       * card that still wins the top of the feed on `createdAt` alone reads
       * as though nothing changed. `getListings` sorts on this to push it
       * down instead.
       */
      anyOptionPaused: options.some((option) => option.reason === 'OWNER_PAUSED'),
    };
  });
};

/**
 * Has the owner switched this whole listing off?
 *
 * The Stay Partner "Taking bookings" toggle writes `isAvailable` to every
 * `partner_share_types` row of a property in one update, so "all recorded room
 * types paused" is precisely what that switch being off looks like from here.
 * There is no flag on the property itself — `Property.isAvailable` does not
 * exist — and this is deliberately derived rather than adding one, because a
 * second copy of the same fact is a second thing to get out of step.
 *
 * Room types with no count recorded are ignored rather than counted as paused:
 * an unfinished listing is not a switched-off one.
 */
const ownerPaused = (options) => {
  const known = options.filter((option) => option.reason !== 'NO_INVENTORY_RECORDED');
  return known.length > 0 && known.every((option) => option.reason === 'OWNER_PAUSED');
};

const getListings = async (req, res, next) => {
  try {
    const {
      category, city, locality, maxPrice, search,
    } = req.query;
    /* A listing the owner deleted from their own app. Excluded here, in the
       Mongo query, rather than filtered alongside `paused` below — a removed
       property has no `partner_share_types` rows worth loading availability
       for, and the point is that it is gone from the feed as completely as a
       property that never existed. See `removeMyProperty`. */
    const filter = { status: { $ne: 'removed' } };

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
        /* Unanchored, as it always was — it used to be what let
           `?category=Bachelor` match the stored "Bachelor Room". The stored
           values are codes now, so the two agree exactly, but a bookmarked
           link with the old spelling still resolves through the same match. */
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
    /* One lookup for the page, so the feed and the detail screen name the same
       person — see `ownerNamesFor`. */
    const ownerNames = await ownerNamesFor(properties);
    const ownerDigits = (doc) => String(doc.ownerMobile || '').replace(/\D/g, '').slice(-10);
    let listings = properties.map(
      (doc) => formatListing(doc, ownerNames.get(ownerDigits(doc)) || ''),
    );

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

    const withBeds = await withAvailability(listings);

    /*
     * A listing the owner switched off does not appear in the feed.
     *
     * It used to. The share-type pause made every room non-requestable and the
     * card stayed in Explore with its button greyed out — reasonable for one
     * room type being full, wrong for an owner who has told us to stop sending
     * people. They flip the switch, watch it move, and keep getting requests.
     *
     * Filtered HERE rather than in the Mongo query because the answer lives in
     * `partner_share_types`, which this query does not join — `withAvailability`
     * is where those rows are already loaded.
     *
     * Hidden from the FEED only. `GET /listings/:id` still resolves, so a saved
     * card, a shared link or an open booking never turns into a 404; it reports
     * `paused: true` and `requestable: false` instead.
     */
    const visible = withBeds.filter((listing) => !listing.paused);

    /*
     * A listing with a paused room type sorts last, not first.
     *
     * `.sort` is stable, so this only demotes the `anyOptionPaused` listings —
     * the newest-first order above still decides both groups. The owner
     * flipped a switch specifically to stop new requests on part of this
     * listing; ranking it above properties nothing is paused on undoes that on
     * the one screen students actually browse.
     */
    const ranked = [...visible].sort(
      (a, b) => Number(a.anyOptionPaused) - Number(b.anyOptionPaused),
    );

    return res.json({ success: true, count: ranked.length, data: ranked });
  } catch (error) {
    return next(error);
  }
};

// @route   GET /api/v2/listings/:id
// @desc    A single listing
// @access  Public
/**
 * What guests said about a place, for the listing page.
 *
 * Public, like the listing itself: a student decides whether to request a
 * bed partly on this, before they have an account. Nothing personal is sent —
 * `author` is the first name the student typed, `customerId` and `bookingId`
 * stay behind. The owner's reply rides on each review so a student sees both
 * halves of the exchange; that reply used to exist only on the owner's phone.
 *
 * `averageRating` is null with no reviews. A listing with nothing said about
 * it has no rating, and inventing one — for a place that may be brand new —
 * is exactly what this page must not do.
 *
 * @route GET /api/v2/listings/:id/reviews
 */
const getListingReviews = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Listing not found' });
    }

    // eslint-disable-next-line global-require
    const { PartnerReview } = require('../partners/partnerDomains.model');
    const rows = await PartnerReview.find({ propertyId: String(id) })
      .sort({ createdAt: -1 }).limit(100)
      .select('author rating comment date reply createdAt').lean();

    const data = rows.map((r) => ({
      id: String(r._id),
      author: r.author,
      rating: r.rating,
      comment: r.comment,
      date: r.date,
      reply: r.reply && r.reply.text ? { text: r.reply.text, at: r.reply.at } : null,
    }));

    const averageRating = data.length
      ? Math.round((data.reduce((sum, r) => sum + r.rating, 0) / data.length) * 10) / 10
      : null;

    return res.json({ success: true, averageRating, count: data.length, data });
  } catch (error) {
    return next(error);
  }
};

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

    /* The one screen the booking flow reads. Whoever the student is told to
       expect at the door has to be the person who actually holds the account. */
    const ownerNames = await ownerNamesFor([property]);
    const digits = String(property.ownerMobile || '').replace(/\D/g, '').slice(-10);
    const [listing] = await withAvailability([
      formatListing(property, ownerNames.get(digits) || ''),
    ]);

    /*
     * A removed listing still resolves — same reasoning as a paused one: a
     * saved card, a shared link or an old booking that names this property
     * must not turn into a 404. It just cannot be requested any more, which
     * `withAvailability` has no way to know since it never sees `status`.
     */
    if (property.status === 'removed') {
      listing.removed = true;
      listing.requestable = false;
    }

    return res.json({ success: true, data: listing });
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

      const categoryName = normaliseCategory(row.category) || DEFAULT_CATEGORY;

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

module.exports = { getListings, getListingById, getListingMeta,
  getListingReviews,
};

import express from 'express';
import mongoose from 'mongoose';
import Property from '../models/Property.js';

const router = express.Router();

/* Without this, a query issued while the connection is down sits in mongoose's
   buffer until it times out ten seconds later and surfaces as a generic 500.
   The site has no fallback data any more, so the visitor is looking at an
   error either way — it should be the true one, immediately. */
const requireDb = (req, res, next) => {
  if (mongoose.connection.readyState === 1) return next();
  return res.status(503).json({
    success: false,
    code: 'DB_DISCONNECTED',
    message: 'The server is running but not connected to the database.',
  });
};

/* Kept in step with backend/scripts/export-listings.mjs — the API and the
   build-time snapshot must derive the same city from the same `place`, or the
   two disagree about what the city filter should contain. */
const KNOWN_CITIES = [
  'Visakhapatnam', 'Vizag', 'Vijayawada', 'Amaravati', 'Guntur', 'Tirupati',
  'Kakinada', 'Nellore', 'Kurnool', 'Hyderabad', 'Bangalore', 'Bengaluru',
  'Chennai', 'Mumbai', 'Pune', 'Delhi',
];
const CITY_ALIAS = { Vizag: 'Visakhapatnam', Bengaluru: 'Bangalore' };

/* `place` is free text from the panel, so a recognised name anywhere in the
   string wins; otherwise the tail after the last comma, or the whole string.
   It must never fall back to a fixed city — doing so filed every unrecognised
   place under Visakhapatnam, a city those listings had nothing to do with. */
const cityOf = (place) => {
  const hit = KNOWN_CITIES.find(c => new RegExp(`\\b${c}\\b`, 'i').test(place));
  if (hit) return CITY_ALIAS[hit] || hit;
  const parts = String(place).split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : String(place).trim();
};

// Dormitories and pods are quoted nightly, and the panel says so two ways.
const isDaily = d => d.categoryDetails?.rateType === 'Daily Rate'
  || (d.dailyPrice > 0 && !(d.monthlyPrice > 0));

// Helper to format property doc into listing shape
const formatListing = (doc) => {
  const d = doc.toObject ? doc.toObject() : doc;
  const categorySlug = String(d.category || 'stay').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Format images array
  let images = Array.isArray(d.images) && d.images.length > 0 ? d.images : [];
  if (images.length === 0 && d.imageUrl) {
    images = [d.imageUrl];
  }

  const place = String(d.place || '');
  const city = cityOf(place);

  return {
    id: d._id ? String(d._id) : String(d.id),
    name: d.name,
    place: d.place,
    city,
    locality: place.replace(new RegExp(`,?\\s*\\b${city}\\b`, 'i'), '').trim() || place,
    category: d.category || 'PG',
    categorySlug,
    stayType: d.stayType || 'Long Stay',
    longStayDuration: d.longStayDuration || null,
    shortStayDuration: d.shortStayDuration || null,
    rent: d.rent || 0,
    pricePeriod: isDaily(d) ? '/day' : '/mo',
    monthlyPrice: d.monthlyPrice || null,
    dailyPrice: d.dailyPrice || null,
    deposit: d.deposit || null,
    ownerName: d.ownerName || 'Property Owner',
    ownerMobile: d.ownerMobile || '',
    address: d.address || '',
    amenities: Array.isArray(d.amenities) ? d.amenities : [],
    images,
    details: d.categoryDetails || null,
    listedAt: d.createdAt || d.updatedAt || new Date().toISOString(),
  };
};

// @route   GET /api/listings
// @desc    Get all listings with optional filtering
// @access  Public
router.get('/', requireDb, async (req, res, next) => {
  try {
    const { category, city, maxPrice, search } = req.query;
    const filter = {};

    if (category && category !== 'all') {
      filter.category = new RegExp(category, 'i');
    }

    if (maxPrice) {
      filter.rent = { $lte: Number(maxPrice) };
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { place: searchRegex },
        { ownerName: searchRegex },
        { amenities: searchRegex },
      ];
    }

    /* Newest first, and no limit: the Explore page is the only consumer and it
       pages the render itself, so the response is the whole collection. */
    const properties = await Property.find(filter).sort({ createdAt: -1 }).lean();
    let formatted = properties.map(formatListing);

    if (city && city !== 'All Cities') {
      formatted = formatted.filter(item => item.city.toLowerCase() === city.toLowerCase());
    }

    res.json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/listings/:id
// @desc    Get single listing by ID
// @access  Public
router.get('/:id', requireDb, async (req, res, next) => {
  try {
    const { id } = req.params;
    let property = null;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      property = await Property.findById(id).lean();
    } else {
      property = await Property.findOne({ _id: id }).lean();
    }

    if (!property) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    res.json({
      success: true,
      data: formatListing(property),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

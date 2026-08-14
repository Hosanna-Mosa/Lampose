import express from 'express';
import Property from '../models/Property.js';

const router = express.Router();

// Helper to format property doc into listing shape
const formatListing = (doc) => {
  const d = doc.toObject ? doc.toObject() : doc;
  const categorySlug = String(d.category || 'stay').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  
  // Format images array
  let images = Array.isArray(d.images) && d.images.length > 0 ? d.images : [];
  if (images.length === 0 && d.imageUrl) {
    images = [d.imageUrl];
  }

  // Determine city & locality from place
  const place = String(d.place || '');
  const knownCities = ['Visakhapatnam', 'Vizag', 'Vijayawada', 'Amaravati', 'Guntur', 'Tirupati', 'Hyderabad', 'Bangalore', 'Bengaluru', 'Chennai', 'Mumbai', 'Delhi'];
  const cityAlias = { Vizag: 'Visakhapatnam', Bengaluru: 'Bangalore' };
  
  let city = 'Visakhapatnam';
  const foundCity = knownCities.find(c => new RegExp(`\\b${c}\\b`, 'i').test(place));
  if (foundCity) {
    city = cityAlias[foundCity] || foundCity;
  }

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
    pricePeriod: d.dailyPrice && !d.monthlyPrice ? '/day' : '/mo',
    monthlyPrice: d.monthlyPrice || null,
    dailyPrice: d.dailyPrice || null,
    deposit: d.deposit || null,
    ownerName: d.ownerName || 'Property Owner',
    ownerMobile: d.ownerMobile || '',
    address: d.address || '',
    amenities: Array.isArray(d.amenities) ? d.amenities : [],
    images,
    details: d.categoryDetails || {},
    listedAt: d.createdAt || d.updatedAt || new Date().toISOString(),
  };
};

// @route   GET /api/listings
// @desc    Get all listings with optional filtering
// @access  Public
router.get('/', async (req, res, next) => {
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

    const properties = await Property.find(filter).lean();
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
router.get('/:id', async (req, res, next) => {
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

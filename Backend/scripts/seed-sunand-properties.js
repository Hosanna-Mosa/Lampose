/* ══════════════════════════════════════════════════════════════════════════
   Seed script to populate 10 properties for owner 'Sunand' (+919704726252)
   covering all categories (PG_HOSTEL, BACHELOR, HOTEL, COLIVE) with
   complete bookable inventory (partner_share_types) and partner domain data.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const config = require('../src/config/env');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const {
  PartnerBooking,
  PartnerPayout,
  PartnerPaymentMethod,
  PartnerComplaint,
  PartnerNotification,
  PartnerStaff,
  PartnerReview,
  PartnerReferral,
  PartnerShareType,
} = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

const SEED_TAG = 'sunand-seed@lampose.local';
const OWNER_NAME = 'Sunand';
const OWNER_MOBILE = '+919704726252';
const PHONE_DIGITS = '9704726252';

const PHOTOS = [
  'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1574362848149-11496d93a7c7?auto=format&fit=crop&w=1200&q=80',
];

const MEAL_TIMINGS = {
  Breakfast: '7:30 AM - 9:30 AM',
  Lunch: '12:30 PM - 2:30 PM',
  Dinner: '8:00 PM - 10:00 PM',
};

const sunandProperties = [
  // ── 1. PG_HOSTEL (PGs & Hostels) ─────────────────────────────────────────
  {
    name: 'Sunand Heights Executive Mens PG',
    place: 'KPHB Road No. 1, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'PG_HOSTEL',
    employeeEmail: SEED_TAG,
    stayType: 'Both Short & Long Stay',
    longStayDuration: '1 Month+',
    shortStayDuration: '1-7 Days',
    dailyPrice: 400,
    monthlyPrice: 8800,
    rent: 8800,
    deposit: 8800,
    address: 'Plot 15, Near Nexus Mall, KPHB Road No. 1, Hyderabad',
    description: 'Executive men’s PG in KPHB featuring high-speed Wi-Fi, air-conditioned rooms, daily housekeeping, 3-tier security, and nutritious home-cooked meals.',
    imageUrl: PHOTOS[0],
    images: [PHOTOS[0], PHOTOS[1], PHOTOS[2]],
    amenities: ['High-Speed Wi-Fi', 'Air Conditioning', 'Daily Housekeeping', 'Home-Cooked Food (3 Times)', 'Washing Machine & Laundry', 'CCTV & 24/7 Security', 'Power Backup', 'RO Water'],
    categoryDetails: {
      sharingTypes: ['Single', '2 Sharing', '3 Sharing'],
      sharingPrices: { Single: 12500, '2 Sharing': 8800, '3 Sharing': 7000 },
      sharingBeds: { Single: 4, '2 Sharing': 8, '3 Sharing': 12 },
      sharingRooms: { Single: 4, '2 Sharing': 4, '3 Sharing': 4 },
      foodIncluded: true,
      foodType: 'Both (Veg & Non-Veg)',
      mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
      mealTimings: MEAL_TIMINGS,
      curfewTime: '10:30 PM',
      housekeeping: true,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Sunrise Luxury Girls Residency',
    place: 'Koramangala 5th Block, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'PG_HOSTEL',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '1 Month+',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 10500,
    rent: 10500,
    deposit: 10500,
    address: 'House 88, 5th Block Koramangala, Bangalore',
    description: 'Safe and high-end women’s PG residency in Koramangala with biometric entry, full-time resident warden, study hall, and 3 fresh meals daily.',
    imageUrl: PHOTOS[3],
    images: [PHOTOS[3], PHOTOS[4], PHOTOS[5]],
    amenities: ['Wi-Fi', 'Mess Canteen', 'Warden on Site', 'CCTV & 24/7 Security', 'RO Water', 'Study Room', 'Daily Housekeeping', 'Hot Water Geyser', 'Power Backup'],
    categoryDetails: {
      hostelType: 'Girls Hostel',
      roomTypes: ['Single', 'Double Sharing', 'Triple Sharing'],
      sharingPrices: { Single: 14500, 'Double Sharing': 10500, 'Triple Sharing': 8000 },
      sharingBeds: { Single: 5, 'Double Sharing': 10, 'Triple Sharing': 15 },
      sharingRooms: { Single: 5, 'Double Sharing': 5, 'Triple Sharing': 5 },
      foodIncluded: true,
      foodType: 'Both (Veg & Non-Veg)',
      mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
      mealTimings: MEAL_TIMINGS,
      curfewTime: '10:00 PM',
      housekeeping: true,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Scholars Student Hostel',
    place: 'Ameerpet, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'PG_HOSTEL',
    employeeEmail: SEED_TAG,
    stayType: 'Both Short & Long Stay',
    longStayDuration: '1 Month+',
    shortStayDuration: '1-7 Days',
    dailyPrice: 350,
    monthlyPrice: 7000,
    rent: 7000,
    deposit: 7000,
    address: 'Near Metro Station, Ameerpet, Hyderabad',
    description: 'Affordable student hostel near coaching centers in Ameerpet. Quiet study environment, high-speed Wi-Fi, 3 meals daily, and 24/7 power backup.',
    imageUrl: PHOTOS[6],
    images: [PHOTOS[6], PHOTOS[7], PHOTOS[8]],
    amenities: ['Wi-Fi', 'Mess Canteen', 'Study Room', 'CCTV & 24/7 Security', 'RO Water', 'Hot Water Geyser', 'Power Backup'],
    categoryDetails: {
      hostelType: 'Boys Hostel',
      roomTypes: ['Double Sharing', 'Triple Sharing', '4 Sharing'],
      sharingPrices: { 'Double Sharing': 9000, 'Triple Sharing': 7000, '4 Sharing': 5500 },
      sharingBeds: { 'Double Sharing': 8, 'Triple Sharing': 12, '4 Sharing': 16 },
      sharingRooms: { 'Double Sharing': 4, 'Triple Sharing': 4, '4 Sharing': 4 },
      foodIncluded: true,
      foodType: 'Veg & Non-Veg',
      mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
      mealTimings: MEAL_TIMINGS,
      curfewTime: '10:30 PM',
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },

  // ── 2. BACHELOR (Bachelor Flats & Apartments) ───────────────────────────
  {
    name: 'Sunand Palm Grove 1BHK Bachelor Studio',
    place: 'HSR Layout Sector 1, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '6 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 16000,
    rent: 16000,
    deposit: 32000,
    address: 'Plot 31, 27th Main, HSR Layout Sector 1, Bangalore',
    description: 'Modern semi-furnished 1BHK flat for working bachelors in HSR Layout. Modular kitchen, balcony, Kaveri water, and no curfew restrictions.',
    imageUrl: PHOTOS[2],
    images: [PHOTOS[2], PHOTOS[3], PHOTOS[6]],
    amenities: ['Air Conditioning', 'Two-Wheeler Parking', 'Lift', 'Power Backup', 'Water Supply 24x7', 'Wardrobe', 'Modular Kitchen', 'Wi-Fi'],
    categoryDetails: {
      roomTypes: ['1 BHK Independent', '2 BHK Independent'],
      roomType: '1 BHK Independent',
      sharingPrices: { '1 BHK Independent': 16000, '2 BHK Independent': 27000 },
      sharingBeds: { '1 BHK Independent': 4, '2 BHK Independent': 4 },
      sharingRooms: { '1 BHK Independent': 4, '2 BHK Independent': 2 },
      furnishing: 'Semi-Furnished',
      allowedTenants: 'Bachelors Male / Female',
      kitchenAvailable: true,
      waterSupply: '24 Hours Kaveri Water',
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Crest 2BHK Bachelor Duplex',
    place: 'Gachibowli, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '11 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 25000,
    rent: 25000,
    deposit: 50000,
    address: 'Crest Towers, Near Financial District, Gachibowli, Hyderabad',
    description: 'Fully furnished 2BHK duplex apartment for IT bachelors. Comes with ACs, smart TV, sofa set, washing machine, refrigerator, and covered car parking.',
    imageUrl: PHOTOS[4],
    images: [PHOTOS[4], PHOTOS[5], PHOTOS[7]],
    amenities: ['Air Conditioning', 'Car & Two-Wheeler Parking', 'Lift', 'Power Backup 100%', 'Security Guard & CCTV', 'Modular Kitchen', 'Washing Machine', 'Refrigerator', 'Wi-Fi'],
    categoryDetails: {
      roomTypes: ['2 BHK Independent', '3 BHK Independent'],
      roomType: '2 BHK Independent',
      sharingPrices: { '2 BHK Independent': 25000, '3 BHK Independent': 35000 },
      sharingBeds: { '2 BHK Independent': 4, '3 BHK Independent': 6 },
      sharingRooms: { '2 BHK Independent': 2, '3 BHK Independent': 2 },
      furnishing: 'Fully Furnished',
      allowedTenants: 'Bachelors Working Professionals',
      kitchenAvailable: true,
      waterSupply: '24/7 Water Supply',
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Metro View 1RK Bachelor Flat',
    place: 'SR Nagar, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '3 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 9000,
    rent: 9000,
    deposit: 18000,
    address: 'Opposite Metro Station, SR Nagar, Hyderabad',
    description: 'Independent 1RK room for bachelors and students. Located right opposite Metro Station. High-speed Wi-Fi, 24/7 water, and secure parking.',
    imageUrl: PHOTOS[1],
    images: [PHOTOS[1], PHOTOS[6], PHOTOS[8]],
    amenities: ['Two-Wheeler Parking', 'Water Supply 24x7', 'Power Backup', 'Wi-Fi'],
    categoryDetails: {
      roomTypes: ['1RK Independent', '1 BHK Independent'],
      roomType: '1RK Independent',
      sharingPrices: { '1RK Independent': 9000, '1 BHK Independent': 13000 },
      sharingBeds: { '1RK Independent': 6, '1 BHK Independent': 4 },
      sharingRooms: { '1RK Independent': 6, '1 BHK Independent': 4 },
      furnishing: 'Semi-Furnished',
      allowedTenants: 'Bachelors Male / Female',
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },

  // ── 3. HOTEL (Hotels & Nightly Stays / Pods / Dorms) ────────────────────
  {
    name: 'Sunand Regency Luxury Hotel & Suites',
    place: 'Indiranagar 100ft Road, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'HOTEL',
    employeeEmail: SEED_TAG,
    stayType: 'Short Stay',
    longStayDuration: '1 Month+',
    shortStayDuration: '1-7 Days',
    dailyPrice: 2100,
    monthlyPrice: 0,
    rent: 2100,
    deposit: 0,
    address: '100ft Road, Near To Metro Station, Indiranagar, Bangalore',
    description: 'Executive luxury hotel offering plush AC suites, king beds, complimentary buffet breakfast, 24/7 room service, and valet parking.',
    imageUrl: PHOTOS[5],
    images: [PHOTOS[5], PHOTOS[7], PHOTOS[9]],
    amenities: ['Air Conditioning', 'Complimentary Breakfast', '24/7 Room Service', 'Smart TV', 'Mini Fridge', 'Free High-Speed Wi-Fi', 'Elevator', 'Valet Parking'],
    categoryDetails: {
      bedTypes: ['Executive Suite', 'Deluxe AC Room'],
      bedType: 'Executive Suite',
      sharingPrices: { 'Executive Suite': 2100, 'Deluxe AC Room': 1500 },
      sharingBeds: { 'Executive Suite': 8, 'Deluxe AC Room': 12 },
      sharingRooms: { 'Executive Suite': 8, 'Deluxe AC Room': 12 },
      rateType: 'Daily Rate',
      foodIncluded: true,
      checkInTime: '12:00 PM',
      checkOutTime: '11:00 AM',
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Traveler’s Pod & Capsule Stay',
    place: 'Gachibowli, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'HOTEL',
    employeeEmail: SEED_TAG,
    stayType: 'Short Stay',
    longStayDuration: '1 Month+',
    shortStayDuration: '1-7 Days',
    dailyPrice: 650,
    monthlyPrice: 0,
    rent: 650,
    deposit: 0,
    address: 'Financial District Main Road, Gachibowli, Hyderabad',
    description: 'Japanese-style futuristic capsule pod stay. Features ambient mood lighting, international power socket, digital locker, and rooftop cafe.',
    imageUrl: PHOTOS[9],
    images: [PHOTOS[9], PHOTOS[2], PHOTOS[3]],
    amenities: ['Private Pod AC', 'Digital Lockers', 'Free High-Speed Wi-Fi', 'Rooftop Cafe', '24/7 Hot Water', 'Daily Housekeeping'],
    categoryDetails: {
      bedTypes: ['Luxury Pod Bed', 'Double Pod Suite'],
      bedType: 'Luxury Pod Bed',
      sharingPrices: { 'Luxury Pod Bed': 650, 'Double Pod Suite': 1100 },
      sharingBeds: { 'Luxury Pod Bed': 20, 'Double Pod Suite': 10 },
      sharingRooms: { 'Luxury Pod Bed': 20, 'Double Pod Suite': 10 },
      rateType: 'Daily Rate',
      foodIncluded: false,
      lockersAvailable: true,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },

  // ── 4. COLIVE (House / Co-live) ─────────────────────────────────────────
  {
    name: 'Sunand Urban Roots Co-Living Residency',
    place: 'BTM Layout 2nd Stage, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'COLIVE',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '1 Month+',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 15500,
    rent: 15500,
    deposit: 31000,
    address: '7th Cross, BTM Layout 2nd Stage, Bangalore',
    description: 'Vibrant co-living community for tech professionals. Fully furnished studio suites, co-working space, rooftop lounge, weekly housekeeping, and all bills included.',
    imageUrl: PHOTOS[0],
    images: [PHOTOS[0], PHOTOS[4], PHOTOS[8]],
    amenities: ['Air Conditioning', 'Co-Working Lounge', 'High-Speed Wi-Fi', 'Gaming Console & TV Zone', 'Daily Housekeeping', 'Fully Equipped Kitchen', 'Power Backup'],
    categoryDetails: {
      roomTypes: ['Studio Apartment', 'Shared Co-Live Suite'],
      roomType: 'Studio Apartment',
      sharingPrices: { 'Studio Apartment': 15500, 'Shared Co-Live Suite': 11500 },
      sharingBeds: { 'Studio Apartment': 6, 'Shared Co-Live Suite': 12 },
      sharingRooms: { 'Studio Apartment': 6, 'Shared Co-Live Suite': 6 },
      furnishing: 'Fully Furnished',
      foodIncluded: false,
      communityEvents: true,
      cleaningIncluded: true,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Green Leaf Co-Living Villa',
    place: 'KPHB, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'COLIVE',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '1 Month+',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 13500,
    rent: 13500,
    deposit: 27000,
    address: 'Phase 3, KPHB Colony, Hyderabad',
    description: 'Spacious co-living villa with private bedrooms, shared gaming zone, high-speed Wi-Fi, fully set up community kitchen, and 24/7 security.',
    imageUrl: PHOTOS[3],
    images: [PHOTOS[3], PHOTOS[7], PHOTOS[9]],
    amenities: ['Air Conditioning', 'High-Speed Wi-Fi', 'Shared Kitchen', 'Power Backup 24/7', 'Laundry Unit', 'Security & CCTV'],
    categoryDetails: {
      roomTypes: ['1 BHK Independent', '2 BHK Independent'],
      roomType: '1 BHK Independent',
      sharingPrices: { '1 BHK Independent': 13500, '2 BHK Independent': 23000 },
      sharingBeds: { '1 BHK Independent': 5, '2 BHK Independent': 6 },
      sharingRooms: { '1 BHK Independent': 5, '2 BHK Independent': 3 },
      furnishing: 'Fully Furnished',
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
];

(async () => {
  try {
    if (!config.db.uri) {
      console.error('MONGO_URI is missing from Backend/.env');
      process.exit(1);
    }

    await mongoose.connect(config.db.uri, { dbName: config.db.dbName, ...config.db.options });
    const dbName = mongoose.connection.name;
    const host = mongoose.connection.host;
    console.log(`\n📍 Database: ${dbName} on ${host}`);

    // 1. Ensure Partner Record in `app_partners`
    let partner = await Partner.findOne({
      $or: [{ phone: OWNER_MOBILE }, { phoneDigits: PHONE_DIGITS }],
    });

    if (!partner) {
      const partnerId = `prt_${Math.random().toString(36).substr(2, 16)}`;
      partner = await Partner.create({
        partnerId,
        name: OWNER_NAME,
        phone: OWNER_MOBILE,
        phoneDigits: PHONE_DIGITS,
        phoneVerifiedAt: new Date(),
        profileCompletedAt: new Date(),
        acceptingBookings: true,
        status: 'active',
      });
      console.log(`✅ Created Partner account for ${OWNER_NAME} (${OWNER_MOBILE})`);
    } else {
      partner.name = OWNER_NAME;
      partner.phoneVerifiedAt = partner.phoneVerifiedAt || new Date();
      partner.profileCompletedAt = partner.profileCompletedAt || new Date();
      partner.acceptingBookings = true;
      await partner.save();
      console.log(`✅ Updated existing Partner account for ${OWNER_NAME} (${OWNER_MOBILE})`);
    }

    // 2. Clear old seeded properties for Sunand
    const { deletedCount } = await Property.deleteMany({ employeeEmail: SEED_TAG });
    if (deletedCount) console.log(`🧹 Removed ${deletedCount} previously seeded properties for ${OWNER_NAME}.`);

    // 3. Insert new 10 properties
    const inserted = await Property.insertMany(sunandProperties, { ordered: false });
    console.log(`\n🎉 Successfully inserted ${inserted.length} properties for ${OWNER_NAME} (${OWNER_MOBILE}).`);

    // 4. Sync Inventory & PartnerShareTypes for EVERY seeded property!
    console.log('\n🔄 Syncing PartnerShareTypes and Inventory for all seeded properties...');
    let totalCreatedShareTypes = 0;

    for (const property of inserted) {
      const syncResult = await syncShareTypes(property);
      totalCreatedShareTypes += (syncResult.created + syncResult.synced);
      console.log(`   ✔️  [${property.category}] ${property.name} -> ${syncResult.created} share types created, ${syncResult.synced} synced.`);
    }

    console.log(`\n✨ Total PartnerShareTypes active: ${totalCreatedShareTypes}`);

    // 5. Seed Partner Domains Data (Bookings, Reviews, Payment Method, Complaints, Referrals)
    const sampleProperty = inserted[0];
    const samplePropId = String(sampleProperty._id);

    // Bookings
    const existingBookingsCount = await PartnerBooking.countDocuments({ partnerPhoneDigits: PHONE_DIGITS });
    if (existingBookingsCount === 0) {
      await PartnerBooking.insertMany([
        {
          partnerPhoneDigits: PHONE_DIGITS,
          propertyId: samplePropId,
          propertyName: sampleProperty.name,
          category: sampleProperty.category,
          guestName: 'Rahul Sharma',
          guestPhone: '+919876543210',
          guestEmail: 'rahul.s@gmail.com',
          roomNumber: '101',
          shareType: 'Single',
          checkInDate: '2026-08-15',
          checkOutDate: '2026-08-20',
          status: 'in_house',
          totalAmount: 12500,
          paidAmount: 12500,
          notes: 'Guest moved in smoothly',
        },
        {
          partnerPhoneDigits: PHONE_DIGITS,
          propertyId: samplePropId,
          propertyName: sampleProperty.name,
          category: sampleProperty.category,
          guestName: 'Priya Verma',
          guestPhone: '+919876543211',
          guestEmail: 'priya.v@gmail.com',
          roomNumber: '102',
          shareType: '2 Sharing',
          checkInDate: '2026-08-17',
          checkOutDate: '2026-08-22',
          status: 'arriving',
          totalAmount: 8800,
          paidAmount: 8800,
        },
      ]);
      console.log('✅ Seeded sample partner bookings');
    }

    // Payment Method
    const existingMethodCount = await PartnerPaymentMethod.countDocuments({ partnerPhoneDigits: PHONE_DIGITS });
    if (existingMethodCount === 0) {
      await PartnerPaymentMethod.create({
        partnerPhoneDigits: PHONE_DIGITS,
        type: 'bank_account',
        accountName: OWNER_NAME,
        accountNumber: 'XXXX-XXXX-4321',
        ifsc: 'HDFC0001234',
        isPrimary: true,
      });
      console.log('✅ Seeded primary bank account payment method');
    }

    // Reviews
    const existingReviewsCount = await PartnerReview.countDocuments({ partnerPhoneDigits: PHONE_DIGITS });
    if (existingReviewsCount === 0) {
      await PartnerReview.insertMany([
        {
          partnerPhoneDigits: PHONE_DIGITS,
          propertyId: samplePropId,
          propertyName: sampleProperty.name,
          rating: 5,
          author: 'Aarav Patel',
          comment: 'Outstanding staying experience! Clean rooms, high speed Wi-Fi and awesome food.',
          date: '2026-08-14',
        },
        {
          partnerPhoneDigits: PHONE_DIGITS,
          propertyId: samplePropId,
          propertyName: sampleProperty.name,
          rating: 5,
          author: 'Sanya Gupta',
          comment: 'Very comfortable stay, close to the metro station. Sunand Sir is very supportive.',
          date: '2026-08-10',
        },
      ]);
      console.log('✅ Seeded sample partner reviews');
    }

    // Referrals
    const existingReferralCount = await PartnerReferral.countDocuments({ partnerPhoneDigits: PHONE_DIGITS });
    if (existingReferralCount === 0) {
      await PartnerReferral.create({
        partnerPhoneDigits: PHONE_DIGITS,
        code: `SUN-${PHONE_DIGITS.slice(-4)}`,
        points: 500,
        earningsRupees: 500,
        invitedCount: 3,
        history: [
          { name: 'Karan Malhotra', date: '2026-08-01', status: 'Joined', rewardPoints: 100 },
          { name: 'Neha Sharma', date: '2026-08-05', status: 'Joined', rewardPoints: 100 },
        ],
      });
      console.log('✅ Seeded partner referral code');
    }

    console.log('\n🚀 ALL 10 SEEDED PROPERTIES ARE NOW FULLY BOOKABLE AND CONTROLLABLE FROM THE OWNER APP!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
  }
})();

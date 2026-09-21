/* ══════════════════════════════════════════════════════════════════════════
   Reseed script to replace all BACHELOR category properties for owner 'Sunand' (+919704726252)
   with fresh new bachelor property listings and sync partner_share_types.
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const config = require('../src/config/env');
const Property = require('../src/modules/properties/property.model');
const Partner = require('../src/modules/partners/partner.model');
const { PartnerShareType } = require('../src/modules/partners/partnerDomains.model');
const { syncShareTypes } = require('../src/modules/inventory/inventory.service');

/* Refuse to run against production. See src/infrastructure/database/guard.js */
require('../src/infrastructure/database/guard').assertDevTargetOrExit();


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
  'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80',
];

const newBachelorProperties = [
  {
    name: 'Sunand Urban Heights 1BHK Bachelor Loft',
    place: 'Koramangala 3rd Block, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '6 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 17500,
    rent: 17500,
    deposit: 35000,
    address: '12th Main Road, Koramangala 3rd Block, Bangalore',
    description: 'Stylishly designed 1BHK loft for working bachelors in prime Koramangala. High ceilings, private balcony, modular kitchen, and no curfew restrictions.',
    imageUrl: PHOTOS[11],
    images: [PHOTOS[11], PHOTOS[12], PHOTOS[0]],
    amenities: ['Air Conditioning', 'Private Balcony', 'Modular Kitchen', 'Power Backup', 'Wi-Fi Fiber', 'Two-Wheeler Parking', 'Lift'],
    categoryDetails: {
      roomTypes: ['1 BHK Independent', '2 BHK Independent'],
      roomType: '1 BHK Independent',
      sharingPrices: { '1 BHK Independent': 17500, '2 BHK Independent': 28000 },
      sharingBeds: { '1 BHK Independent': 4, '2 BHK Independent': 4 },
      sharingRooms: { '1 BHK Independent': 4, '2 BHK Independent': 2 },
      furnishing: 'Fully Furnished',
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
    name: 'Sunand Financial District 2BHK Bachelor Flat',
    place: 'Nanakramguda, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '11 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 27000,
    rent: 27000,
    deposit: 54000,
    address: 'Near Amazon Campus, Nanakramguda, Financial District, Hyderabad',
    description: 'High-rise 2BHK flat right next to Financial District IT hubs. Fully furnished with split ACs, sofa, smart TV, washing machine, fridge, and covered car parking.',
    imageUrl: PHOTOS[14],
    images: [PHOTOS[14], PHOTOS[13], PHOTOS[4]],
    amenities: ['Air Conditioning', 'Covered Car Parking', '100% Power Backup', 'Smart TV', 'Washing Machine', 'Refrigerator', 'Modular Kitchen', 'Security Guard'],
    categoryDetails: {
      roomTypes: ['2 BHK Independent', '3 BHK Independent'],
      roomType: '2 BHK Independent',
      sharingPrices: { '2 BHK Independent': 27000, '3 BHK Independent': 37000 },
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
    name: 'Sunand Indiranagar Studio Suite',
    place: 'Indiranagar 100ft Road, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '3 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 19500,
    rent: 19500,
    deposit: 39000,
    address: 'Near To Metro Station, 100ft Road, Indiranagar, Bangalore',
    description: 'Luxury studio flat with workstation setup, high-speed Wi-Fi, modern kitchenette, smart TV, and elevator access in central Indiranagar.',
    imageUrl: PHOTOS[2],
    images: [PHOTOS[2], PHOTOS[5], PHOTOS[8]],
    amenities: ['Air Conditioning', 'Workstation Setup', 'Smart TV', 'Kitchenette', 'High-Speed Wi-Fi', 'Elevator'],
    categoryDetails: {
      roomTypes: ['Studio Independent', '1 BHK Independent'],
      roomType: 'Studio Independent',
      sharingPrices: { 'Studio Independent': 19500, '1 BHK Independent': 23500 },
      sharingBeds: { 'Studio Independent': 4, '1 BHK Independent': 4 },
      sharingRooms: { 'Studio Independent': 4, '1 BHK Independent': 2 },
      furnishing: 'Fully Furnished',
      allowedTenants: 'Bachelors Working Professionals',
      kitchenAvailable: true,
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Tech Residency 1RK Bachelor Flat',
    place: 'Madhapur 100ft Road, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '3 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 10500,
    rent: 10500,
    deposit: 21000,
    address: '100ft Road, Near Inorbit Mall, Madhapur, Hyderabad',
    description: 'Compact and affordable 1RK flat for tech bachelors and students. Walking distance to Metro station, 24/7 water supply, and high-speed Wi-Fi.',
    imageUrl: PHOTOS[6],
    images: [PHOTOS[6], PHOTOS[1], PHOTOS[9]],
    amenities: ['Two-Wheeler Parking', 'Water Supply 24x7', 'Wi-Fi Fiber', 'Power Backup'],
    categoryDetails: {
      roomTypes: ['1RK Independent', '1 BHK Independent'],
      roomType: '1RK Independent',
      sharingPrices: { '1RK Independent': 10500, '1 BHK Independent': 14500 },
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
  {
    name: 'Sunand Prime 2BHK Executive Flat',
    place: 'HSR Layout Sector 2, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '6 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 24000,
    rent: 24000,
    deposit: 48000,
    address: '19th Main Road, HSR Sector 2, Bangalore',
    description: 'Spacious 2BHK flat for IT working bachelors. Semi-furnished with wooden wardrobes, modular kitchen, Kaveri water, and reserved parking.',
    imageUrl: PHOTOS[10],
    images: [PHOTOS[10], PHOTOS[3], PHOTOS[7]],
    amenities: ['Wooden Wardrobes', 'Modular Kitchen', 'Kaveri Water', 'Reserved Two-Wheeler Parking', 'Lift', 'Power Backup'],
    categoryDetails: {
      roomTypes: ['2 BHK Independent', '3 BHK Independent'],
      roomType: '2 BHK Independent',
      sharingPrices: { '2 BHK Independent': 24000, '3 BHK Independent': 34000 },
      sharingBeds: { '2 BHK Independent': 4, '3 BHK Independent': 6 },
      sharingRooms: { '2 BHK Independent': 2, '3 BHK Independent': 2 },
      furnishing: 'Semi-Furnished',
      allowedTenants: 'Bachelors Working Professionals',
      kitchenAvailable: true,
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Cyber Heights 3BHK Bachelor Apartment',
    place: 'Gachibowli Outer Ring Road, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '11 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 36000,
    rent: 36000,
    deposit: 72000,
    address: 'ORR Junction, Gachibowli, Hyderabad',
    description: 'Luxury 3BHK high-rise apartment ideal for 3-4 IT bachelors sharing. ACs in all rooms, large hall, balcony with city views, and clubhouse gym.',
    imageUrl: PHOTOS[13],
    images: [PHOTOS[13], PHOTOS[12], PHOTOS[4]],
    amenities: ['Air Conditioning', 'Clubhouse Gym', 'Balcony City Views', 'Car Parking', 'Washing Machine', 'Modular Kitchen', '24/7 Security'],
    categoryDetails: {
      roomTypes: ['3 BHK Independent'],
      roomType: '3 BHK Independent',
      sharingPrices: { '3 BHK Independent': 36000 },
      sharingBeds: { '3 BHK Independent': 6 },
      sharingRooms: { '3 BHK Independent': 2 },
      furnishing: 'Fully Furnished',
      allowedTenants: 'Bachelors Working Professionals',
      kitchenAvailable: true,
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Whitefield 1BHK Furnished Studio',
    place: 'ITPL Main Road, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '6 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 15500,
    rent: 15500,
    deposit: 31000,
    address: 'Opposite ITPL Main Gate, Whitefield, Bangalore',
    description: 'Fully furnished 1BHK apartment directly opposite ITPL. Smart TV, AC, refrigerator, washing machine, and high-speed fiber Wi-Fi.',
    imageUrl: PHOTOS[1],
    images: [PHOTOS[1], PHOTOS[8], PHOTOS[11]],
    amenities: ['Air Conditioning', 'Smart TV', 'Refrigerator', 'Washing Machine', 'Fiber Wi-Fi', '24/7 Security'],
    categoryDetails: {
      roomTypes: ['1 BHK Independent', '2 BHK Independent'],
      roomType: '1 BHK Independent',
      sharingPrices: { '1 BHK Independent': 15500, '2 BHK Independent': 25000 },
      sharingBeds: { '1 BHK Independent': 4, '2 BHK Independent': 4 },
      sharingRooms: { '1 BHK Independent': 4, '2 BHK Independent': 2 },
      furnishing: 'Fully Furnished',
      allowedTenants: 'Bachelors Working Professionals',
      kitchenAvailable: true,
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Jubilee Crest 2BHK Bachelor Residence',
    place: 'Jubilee Hills Road 45, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '11 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 30000,
    rent: 30000,
    deposit: 60000,
    address: 'Road No. 45, Jubilee Hills, Hyderabad',
    description: 'Premium 2BHK flat in upscale Jubilee Hills. Modern architecture, plush sofa set, split ACs, modular kitchen, and covered car parking.',
    imageUrl: PHOTOS[7],
    images: [PHOTOS[7], PHOTOS[0], PHOTOS[14]],
    amenities: ['Air Conditioning', 'Plush Sofa Set', 'Modular Kitchen', 'Car Parking', 'Elevator', 'Power Backup'],
    categoryDetails: {
      roomTypes: ['2 BHK Independent', '3 BHK Independent'],
      roomType: '2 BHK Independent',
      sharingPrices: { '2 BHK Independent': 30000, '3 BHK Independent': 42000 },
      sharingBeds: { '2 BHK Independent': 4, '3 BHK Independent': 6 },
      sharingRooms: { '2 BHK Independent': 2, '3 BHK Independent': 2 },
      furnishing: 'Fully Furnished',
      allowedTenants: 'Bachelors Working Professionals',
      kitchenAvailable: true,
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Electronic City 1BHK Flat',
    place: 'Phase 2 Neeladri Road, Bangalore',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '6 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 13800,
    rent: 13800,
    deposit: 27600,
    address: 'Neeladri Road, Electronic City Phase 2, Bangalore',
    description: 'Clean semi-furnished 1BHK flat close to Infosys & Wipro campuses. Wardrobe, kitchen cabinets, 24hr water, and bike parking.',
    imageUrl: PHOTOS[9],
    images: [PHOTOS[9], PHOTOS[5], PHOTOS[3]],
    amenities: ['Wardrobe', 'Kitchen Cabinets', '24/7 Water', 'Bike Parking', 'Wi-Fi Ready'],
    categoryDetails: {
      roomTypes: ['1 BHK Independent', '2 BHK Independent'],
      roomType: '1 BHK Independent',
      sharingPrices: { '1 BHK Independent': 13800, '2 BHK Independent': 22000 },
      sharingBeds: { '1 BHK Independent': 4, '2 BHK Independent': 4 },
      sharingRooms: { '1 BHK Independent': 4, '2 BHK Independent': 2 },
      furnishing: 'Semi-Furnished',
      allowedTenants: 'Bachelors Male / Female',
      kitchenAvailable: true,
      foodIncluded: false,
    },
    isVerified: true,
    verificationStatus: 'verified',
    status: 'active',
  },
  {
    name: 'Sunand Kondapur Vista 2BHK Bachelor Home',
    place: 'Near RTO Kondapur, Hyderabad',
    ownerName: OWNER_NAME,
    ownerMobile: OWNER_MOBILE,
    ownerAltMobile: OWNER_MOBILE,
    category: 'BACHELOR',
    employeeEmail: SEED_TAG,
    stayType: 'Long Stay',
    longStayDuration: '6 months min',
    shortStayDuration: '1-7 Days',
    dailyPrice: 0,
    monthlyPrice: 23500,
    rent: 23500,
    deposit: 47000,
    address: 'Near RTO Office, Kondapur, Hyderabad',
    description: 'Well-ventilated 2BHK flat with balconies, semi-furnished setup, modular kitchen, car parking, and 24/7 power backup.',
    imageUrl: PHOTOS[4],
    images: [PHOTOS[4], PHOTOS[10], PHOTOS[6]],
    amenities: ['Modular Kitchen', 'Dual Balconies', 'Car Parking', '24/7 Power Backup', 'Security Guard'],
    categoryDetails: {
      roomTypes: ['2 BHK Independent', '3 BHK Independent'],
      roomType: '2 BHK Independent',
      sharingPrices: { '2 BHK Independent': 23500, '3 BHK Independent': 33000 },
      sharingBeds: { '2 BHK Independent': 4, '3 BHK Independent': 6 },
      sharingRooms: { '2 BHK Independent': 2, '3 BHK Independent': 2 },
      furnishing: 'Semi-Furnished',
      allowedTenants: 'Bachelors Working Professionals',
      kitchenAvailable: true,
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
    console.log(`\n📍 Connected to Database: ${dbName} on ${host}`);

    // 1. Find existing BACHELOR properties for owner 9704726252
    console.log(`\n🔍 Finding existing BACHELOR properties for owner ${PHONE_DIGITS}...`);
    const existingBachelorProps = await Property.find({
      $and: [
        {
          $or: [
            { employeeEmail: SEED_TAG },
            { ownerMobile: { $regex: PHONE_DIGITS } },
            { ownerAltMobile: { $regex: PHONE_DIGITS } },
          ],
        },
        { category: { $regex: '^BACHELOR$', $options: 'i' } },
      ],
    }).lean();

    const existingPropIds = existingBachelorProps.map((p) => String(p._id));
    console.log(`   └─ Found ${existingBachelorProps.length} existing BACHELOR properties to delete.`);

    if (existingPropIds.length > 0) {
      const { deletedCount: deletedShareTypes } = await PartnerShareType.deleteMany({
        propertyId: { $in: existingPropIds },
      });
      console.log(`   └─ Removed ${deletedShareTypes} associated PartnerShareTypes.`);

      const { deletedCount: deletedProps } = await Property.deleteMany({
        _id: { $in: existingPropIds },
      });
      console.log(`   └─ Removed ${deletedProps} existing BACHELOR property documents.`);
    }

    // 2. Insert 10 NEW Bachelor properties
    console.log(`\n🌱 Inserting 10 NEW Bachelor properties for owner ${PHONE_DIGITS}...`);
    const inserted = await Property.insertMany(newBachelorProperties, { ordered: false });
    console.log(`🎉 Successfully inserted ${inserted.length} new Bachelor properties.`);

    // 3. Sync inventory & partner_share_types for each new property
    console.log('\n🔄 Syncing PartnerShareTypes and Inventory for new Bachelor properties...');
    let totalCreatedShareTypes = 0;

    for (const property of inserted) {
      const syncResult = await syncShareTypes(property);
      totalCreatedShareTypes += (syncResult.created + syncResult.synced);
      console.log(`   ✔️  [BACHELOR] ${property.name} -> ${syncResult.created} created, ${syncResult.synced} synced.`);
    }

    console.log(`\n✨ Total PartnerShareTypes active for new Bachelor properties: ${totalCreatedShareTypes}`);
    console.log(`\n🚀 SUCCESS! All old bachelor properties removed and 10 new bachelor properties seeded for owner ${PHONE_DIGITS}!`);

  } catch (error) {
    console.error('❌ Reseeding bachelor properties failed:', error);
  } finally {
    await mongoose.disconnect();
  }
})();

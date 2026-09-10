/* ══════════════════════════════════════════════════════════════════════════
   Script to delete all bookings, stay/visit requests, and food orders
   under the owner or user with phone number 9704726252 (+919704726252).
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const config = require('../src/config/env');
const { PartnerBooking } = require('../src/modules/partners/partnerDomains.model');
const VisitRequest = require('../src/modules/visits/visitRequest.model');
const FoodOrder = require('../src/modules/foodpartners/foodOrder.model');
const Customer = require('../src/modules/customers/customer.model');

const PHONE_DIGITS = '9704726252';

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

    // 1. Find Customer account(s) matching phone 9704726252
    const customers = await Customer.find({
      phone: { $regex: PHONE_DIGITS },
    }).lean();
    const customerIds = customers.map((c) => c.customerId).filter(Boolean);
    console.log(`🔍 Found ${customers.length} customer account(s) for ${PHONE_DIGITS}:`, customerIds);

    // 2. Delete PartnerBooking records under owner or guest/user 9704726252
    const bookingFilter = {
      $or: [
        { partnerPhoneDigits: PHONE_DIGITS },
        { guestPhone: { $regex: PHONE_DIGITS } },
        ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
      ],
    };

    const bookings = await PartnerBooking.find(bookingFilter).lean();
    console.log(`🔍 Found ${bookings.length} PartnerBooking document(s) matching ${PHONE_DIGITS}.`);

    const { deletedCount: deletedBookings } = await PartnerBooking.deleteMany(bookingFilter);
    console.log(`✅ Deleted ${deletedBookings} PartnerBooking document(s).`);

    // 3. Delete VisitRequest (stay requests) records under owner or customer 9704726252
    const visitFilter = {
      $or: [
        { ownerMobile: { $regex: PHONE_DIGITS } },
        { 'customer.phone': { $regex: PHONE_DIGITS } },
        ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
      ],
    };

    const visits = await VisitRequest.find(visitFilter).lean();
    console.log(`🔍 Found ${visits.length} VisitRequest document(s) matching ${PHONE_DIGITS}.`);

    const { deletedCount: deletedVisits } = await VisitRequest.deleteMany(visitFilter);
    console.log(`✅ Deleted ${deletedVisits} VisitRequest document(s).`);

    // 4. Delete FoodOrder records under customer 9704726252
    const foodOrderFilter = {
      $or: [
        { 'diner.phone': { $regex: PHONE_DIGITS } },
        { 'customer.phone': { $regex: PHONE_DIGITS } },
        ...(customerIds.length > 0 ? [{ customerId: { $in: customerIds } }] : []),
      ],
    };

    const foodOrders = await FoodOrder.find(foodOrderFilter).lean();
    console.log(`🔍 Found ${foodOrders.length} FoodOrder document(s) matching ${PHONE_DIGITS}.`);

    const { deletedCount: deletedFoodOrders } = await FoodOrder.deleteMany(foodOrderFilter);
    console.log(`✅ Deleted ${deletedFoodOrders} FoodOrder document(s).`);

    console.log(`\n🚀 SUMMARY: All bookings, stay requests, and food orders under owner/user ${PHONE_DIGITS} have been successfully removed!`);
  } catch (error) {
    console.error('❌ Deletion failed:', error);
  } finally {
    await mongoose.disconnect();
  }
})();

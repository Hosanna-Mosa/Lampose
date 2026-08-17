const dotenv = require('dotenv');
dotenv.config();

const { connectDB } = require('./src/infrastructure/database/db');
const Partner = require('./src/modules/partners/partner.model');
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
} = require('./src/modules/partners/partnerDomains.model');

const seedPartnerDomains = async () => {
  try {
    await connectDB();
    console.log('🌱 Seeding Partner domains data...');

    const partners = await Partner.find({}).lean();
    const partnerPhones = partners.map((p) => p.phoneDigits || Partner.phoneKey(p.phone)).filter(Boolean);

    // If no partners in DB, include '9704726252' as default test phone
    if (!partnerPhones.includes('9704726252')) {
      partnerPhones.push('9704726252');
    }

    for (const phoneKey of partnerPhones) {
      // 1. Bookings
      const existingBookings = await PartnerBooking.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingBookings === 0) {
        await PartnerBooking.insertMany([
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            propertyName: 'Sea View Villa',
            guestName: 'Rahul Sharma',
            guestPhone: '+919876543210',
            guestEmail: 'rahul.s@gmail.com',
            roomNumber: '101',
            shareType: 'Single Occupancy',
            checkInDate: '2026-08-15',
            checkOutDate: '2026-08-20',
            status: 'in_house',
            totalAmount: 12000,
            paidAmount: 12000,
            notes: 'Late check-in requested',
          },
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            propertyName: 'Sea View Villa',
            guestName: 'Priya Verma',
            guestPhone: '+919876543211',
            guestEmail: 'priya.v@gmail.com',
            roomNumber: '102',
            shareType: 'Double Occupancy',
            checkInDate: '2026-08-17',
            checkOutDate: '2026-08-22',
            status: 'arriving',
            totalAmount: 9600,
            paidAmount: 9600,
          },
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            propertyName: 'Sea View Villa',
            guestName: 'Vikram Mehta',
            guestPhone: '+919876543212',
            guestEmail: 'vikram.m@gmail.com',
            roomNumber: '105',
            shareType: 'Single Occupancy',
            checkInDate: '2026-08-12',
            checkOutDate: '2026-08-17',
            status: 'departing',
            totalAmount: 15000,
            paidAmount: 15000,
          },
        ]);
      }

      // 2. Payouts & Payment Methods
      const existingPayouts = await PartnerPayout.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingPayouts === 0) {
        await PartnerPayout.insertMany([
          {
            partnerPhoneDigits: phoneKey,
            amount: 9600,
            status: 'completed',
            payoutDate: new Date().toISOString().split('T')[0],
            bankAccount: 'HDFC Bank (•••• 4321)',
            referenceId: 'PAY-897321',
            breakdown: { rent: 10000, platformFee: 300, taxes: 100, netAmount: 9600 },
          },
          {
            partnerPhoneDigits: phoneKey,
            amount: 48800,
            status: 'completed',
            payoutDate: '2026-08-10',
            bankAccount: 'HDFC Bank (•••• 4321)',
            referenceId: 'PAY-896500',
            breakdown: { rent: 50000, platformFee: 900, taxes: 300, netAmount: 48800 },
          },
        ]);
      }

      const existingMethods = await PartnerPaymentMethod.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingMethods === 0) {
        await PartnerPaymentMethod.create({
          partnerPhoneDigits: phoneKey,
          type: 'bank_account',
          accountName: 'Anjali Sharma',
          accountNumber: 'XXXX-XXXX-4321',
          ifsc: 'HDFC0001234',
          isPrimary: true,
        });
      }

      // 3. Complaints
      const existingComplaints = await PartnerComplaint.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingComplaints === 0) {
        await PartnerComplaint.insertMany([
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            propertyName: 'Sea View Villa',
            title: 'AC cooling issue in Room 102',
            category: 'Maintenance',
            status: 'open',
            priority: 'high',
            description: 'Guest reported AC is not cooling effectively.',
            responses: [],
          },
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            propertyName: 'Sea View Villa',
            title: 'Water pressure low in 2nd floor',
            category: 'Plumbing',
            status: 'in_progress',
            priority: 'medium',
            description: 'Plumber visited, replacement part ordered.',
            responses: [],
          },
        ]);
      }

      // 4. Notifications
      const existingNotifications = await PartnerNotification.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingNotifications === 0) {
        await PartnerNotification.insertMany([
          {
            partnerPhoneDigits: phoneKey,
            title: 'New Visit Request',
            message: 'You have a new visit request for Sea View Villa.',
            category: 'requests',
            read: false,
          },
          {
            partnerPhoneDigits: phoneKey,
            title: 'Payout Processed',
            message: '₹9,600 has been transferred to your HDFC bank account.',
            category: 'payouts',
            read: true,
          },
        ]);
      }

      // 5. Staff
      const existingStaff = await PartnerStaff.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingStaff === 0) {
        await PartnerStaff.insertMany([
          {
            partnerPhoneDigits: phoneKey,
            name: 'Ramesh Kumar',
            phone: '+919123456789',
            role: 'Property Manager',
            permissions: ['requests', 'bookings', 'maintenance'],
            status: 'active',
          },
        ]);
      }

      // 6. Reviews
      const existingReviews = await PartnerReview.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingReviews === 0) {
        await PartnerReview.insertMany([
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            propertyName: 'Sea View Villa',
            rating: 5,
            author: 'Aarav Patel',
            comment: 'Great staying experience! Clean rooms and polite staff.',
            date: '2026-08-14',
          },
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            propertyName: 'Sea View Villa',
            rating: 4,
            author: 'Sanya Gupta',
            comment: 'Very comfortable stay, close to college campus.',
            date: '2026-08-10',
          },
        ]);
      }

      // 7. Referrals
      const existingReferral = await PartnerReferral.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingReferral === 0) {
        await PartnerReferral.create({
          partnerPhoneDigits: phoneKey,
          code: `PAR-${phoneKey.slice(-4)}`,
          points: 500,
          earningsRupees: 500,
          invitedCount: 5,
          history: [
            { name: 'Karan Malhotra', date: '2026-08-01', status: 'Joined', rewardPoints: 100 },
            { name: 'Neha Sharma', date: '2026-08-05', status: 'Joined', rewardPoints: 100 },
          ],
        });
      }

      // 8. Share Types
      const existingShareTypes = await PartnerShareType.countDocuments({ partnerPhoneDigits: phoneKey });
      if (existingShareTypes === 0) {
        await PartnerShareType.insertMany([
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            shareTypeId: 'st_1',
            name: 'Single Occupancy Room',
            monthlyPrice: 12000,
            totalBeds: 10,
            availableBeds: 2,
            isAvailable: true,
          },
          {
            partnerPhoneDigits: phoneKey,
            propertyId: 'prop_1',
            shareTypeId: 'st_2',
            name: 'Double Sharing Room',
            monthlyPrice: 8500,
            totalBeds: 20,
            availableBeds: 4,
            isAvailable: true,
          },
        ]);
      }
    }

    console.log('✅ Partner domains data seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
};

seedPartnerDomains();

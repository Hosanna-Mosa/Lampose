const dotenv = require('dotenv');
dotenv.config();

const { connectDB } = require('./src/infrastructure/database/db');
const Admin = require('./src/modules/admins/admin.model');

const seedSuperAdmin = async () => {
  try {
    await connectDB();

    const existingSuperAdmin = await Admin.findOne({ role: 'Super Admin' });
    if (existingSuperAdmin) {
      console.log(`ℹ️ [Seed] Super Admin already exists: ${existingSuperAdmin.email}`);
      process.exit(0);
    }

    /* From .env, never a literal: a password committed to the repo is a
       password everyone with read access already has. */
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      console.error('❌ [Seed] ADMIN_PASSWORD is not set in .env — refusing to seed a well-known default.');
      process.exit(1);
    }

    const superAdmin = await Admin.create({
      name: 'Sarah Connor (Super Admin)',
      email: 'superadmin@lampose.io',
      password,
      role: 'Super Admin',
      status: 'Active',
    });

    console.log(`🎉 [Seed Success] Created Super Admin account: ${superAdmin.email}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ [Seed Error]', error);
    process.exit(1);
  }
};

seedSuperAdmin();

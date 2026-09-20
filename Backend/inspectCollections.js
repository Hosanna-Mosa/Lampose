const dotenv = require('dotenv');
dotenv.config();
const mongoose = require('mongoose');

async function inspectDatabaseCollections() {
  console.log('🔍 Connecting to MongoDB Atlas...');
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('❌ MONGO_URI is not set. Add it to Backend/.env (see .env.example).');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to database:', mongoose.connection.name);

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log(`\n📋 Found ${collections.length} Collections in MongoDB database "${db.databaseName}":\n`);

    const collectionDetails = [];

    for (const colInfo of collections) {
      const name = colInfo.name;
      const col = db.collection(name);
      const count = await col.countDocuments();
      const sampleDoc = await col.findOne({});
      const fields = sampleDoc ? Object.keys(sampleDoc) : [];

      console.log(`📌 Collection: "${name}"`);
      console.log(`   - Document Count: ${count}`);
      console.log(`   - Sample Fields: ${fields.join(', ')}`);
      console.log('--------------------------------------------------');

      collectionDetails.push({
        name,
        count,
        fields,
        sampleDoc,
      });
    }

    console.log('\nJSON Summary:');
    console.log(JSON.stringify(collectionDetails, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error inspecting database:', err);
    process.exit(1);
  }
}

inspectDatabaseCollections();

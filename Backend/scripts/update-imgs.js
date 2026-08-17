const mongoose = require('mongoose');
const config = require('../src/config/env');

async function run() {
  await mongoose.connect(config.db.uri, { dbName: config.db.dbName });
  const col = mongoose.connection.db.collection('properties');
  const defaultImgs = [
    'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80',
  ];
  const res = await col.updateMany(
    { $or: [{ images: { $exists: false } }, { images: { $size: 0 } }] },
    { $set: { images: defaultImgs, imageUrl: defaultImgs[0] } }
  );
  console.log('Successfully updated property images in MongoDB:', res.modifiedCount);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

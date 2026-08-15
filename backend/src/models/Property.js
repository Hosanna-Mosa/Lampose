import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    place: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    stayType: { type: String, default: 'Long Stay' },
    longStayDuration: { type: String, default: null },
    shortStayDuration: { type: String, default: null },
    rent: { type: Number, required: true },
    monthlyPrice: { type: Number, default: null },
    dailyPrice: { type: Number, default: null },
    deposit: { type: Number, default: null },
    ownerName: { type: String, required: true },
    ownerMobile: { type: String, required: true },
    address: { type: String, default: '' },
    description: { type: String, default: '' },
    amenities: { type: [String], default: [] },
    images: { type: [String], default: [] },
    imageUrl: { type: String, default: '' },
    categoryDetails: { type: Object, default: {} },
    status: { type: String, default: 'active' },
  },
  {
    timestamps: true,
    collection: 'properties',
  }
);

const Property = mongoose.models.Property || mongoose.model('Property', propertySchema);

export default Property;

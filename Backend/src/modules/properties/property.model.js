/* ══════════════════════════════════════════════════════════════════════════
   The `properties` collection — one schema, three readers.

   Mongoose registers a model name once per process, so the two merged
   backends cannot each keep their own Property. This is the union of both:

     · Every field, validator and enum the onboarding backend had is kept
       exactly as it was. A document that was valid before is still valid.
     · `description` and `status` are added from the leads backend. Without
       them a property onboarded through the leads panel would silently lose
       its description on write.
     · The collection name is pinned rather than left to mongoose's pluraliser,
       so the existing data keeps being found where it already lives.

   The leads backend kept this schema non-strict, on the reasoning that a
   second app it could not see also wrote to the collection. After the merge
   this process *is* both writers, and every field either of them writes is
   declared below — so strict mode goes back on. That matters because
   PUT /api/v1/properties/:id hands `req.body` to findByIdAndUpdate whole:
   non-strict would let any caller add arbitrary fields to a listing.

   Read paths that use it:
     /api/v1/properties   the onboarding app  — verified rows + pending ones
                          reconstructed from verificationrequests
     /api/v2/properties   the leads panel     — raw documents
     /api/v2/listings     lampose.com         — projected through
                          utils/listingFormatter
   ══════════════════════════════════════════════════════════════════════════ */
const mongoose = require('mongoose');
const { CATEGORIES } = require('../../shared/constants/categories');

/*
 * A pin, as its own schema with `default: undefined` — the same shape and the
 * same reasoning as `shared/utils/address.js`.
 *
 * A nested `{ type, coordinates }` written inline would get mongoose's usual
 * treatment of nested paths and put `{ type: 'Point' }` with no coordinates on
 * EVERY property, pin or not. That is not a point, and a 2dsphere index
 * refuses to extract keys from it — so every property without a location would
 * fail to save the moment the index existed. A sub-schema defaulting to
 * undefined is simply absent instead, which is what "no pin" should look like.
 */
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (pair) => Array.isArray(pair) && pair.length === 2
          && Number.isFinite(pair[0]) && Number.isFinite(pair[1])
          && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90,
        message: 'location.coordinates must be [longitude, latitude] and in range.'
      }
    }
  },
  { _id: false }
);

const propertySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Property name is required'],
      trim: true
    },
    place: {
      type: String,
      required: [true, 'Place/Location is required'],
      trim: true
    },
    ownerName: {
      type: String,
      required: [true, 'Owner name is required'],
      trim: true
    },
    /* The number the v1 verification chain runs on: the approval message is
       sent here and the owner's YES has to come back from it. Required for
       that reason, not merely as contact detail. */
    ownerMobile: {
      type: String,
      required: [true, 'Owner mobile number is required'],
      trim: true
    },
    /* A second number to reach the owner on, when the phone they answer is
       not the one their WhatsApp is registered to. Optional and purely
       informational — the verification chain stays pinned to `ownerMobile`,
       because that is the number a reply can be matched back to. */
    ownerAltMobile: {
      type: String,
      default: '',
      trim: true
    },
    /* Stored as a code, not a label — see shared/constants/categories.js.
       The enum is that module's array so the schema cannot drift from the
       validators that guard the two write paths. */
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: CATEGORIES
    },
    // Employee / Agent email who onboarded this property
    employeeEmail: {
      type: String,
      default: '',
      trim: true
    },
    // Stay Type & Pricing Structure
    stayType: {
      type: String,
      default: 'Long Stay',
      enum: ['Short Stay', 'Long Stay', 'Both Short & Long Stay']
    },
    shortStayDuration: {
      type: String,
      default: '1-7 Days'
    },
    dailyPrice: {
      type: Number,
      default: 0
    },
    longStayDuration: {
      type: String,
      default: '1 Month+'
    },
    monthlyPrice: {
      type: Number,
      default: 0
    },
    rent: {
      type: Number,
      required: [true, 'Rent amount is required'],
      min: [0, 'Rent must be positive']
    },
    deposit: {
      type: Number,
      default: 0
    },
    address: {
      type: String,
      default: ''
    },
    /*
     * Where this is on a map — the link, and the pin, independently.
     *
     * Both optional, and one without the other is a normal answer: a short
     * `maps.app.goo.gl` link hides its coordinates behind a redirect nobody
     * on the browser side may follow, and a pin taken at the doorway has no
     * link until one is written for it. See property.util.js.
     *
     * `mapLink` is stored exactly as the agent pasted it, because what has to
     * be right is where it opens for the student who taps it.
     */
    mapLink: {
      type: String,
      default: '',
      trim: true
    },
    /*
     * GeoJSON, `[longitude, latitude]` — Mongo's order, unswapped, the same
     * as every other point in this backend. Absent (not null) when nobody
     * ever took a fix, which is what keeps it out of a geo query rather than
     * matching at [0, 0].
     */
    location: { type: pointSchema, default: undefined },
    // Written by the leads panel's property form; absent from the original
    // onboarding schema, where strict mode would have dropped it.
    description: {
      type: String,
      default: ''
    },
    imageUrl: {
      type: String,
      default: ''
    },
    images: {
      type: [String],
      default: []
    },
    amenities: {
      type: [String],
      default: []
    },
    categoryDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    /*
     * Ownership and premises paperwork. Hotels must supply two; nothing else
     * is asked for any.
     *
     * TOP-LEVEL, and deliberately not inside `categoryDetails` — the public
     * listing projection returns that whole object verbatim
     * (`listing.formatter.js`: `details: doc.categoryDetails`), so a PAN
     * document filed there would be served to anybody browsing lampose.com.
     * Nothing in the formatter projects this field, so it reaches only the
     * authenticated surfaces: the leads panel and the admin console.
     *
     * The URLs themselves are Cloudinary's default public-read. They are
     * unguessable, which is not the same as private — see the note in
     * Onboard/src/services/api.js. Treat this array as sensitive.
     */
    documents: {
      type: [{
        /* What role it plays: 'pan' | 'premises'. */
        kind: { type: String, trim: true },
        /* For a premises document, which of the accepted kinds it is. */
        docType: { type: String, default: '', trim: true },
        url: { type: String, trim: true },
        /* The original filename, so a reviewer can tell a photo of a bill from
           a scan of a licence without opening both. */
        name: { type: String, default: '', trim: true },
        uploadedAt: { type: Date, default: Date.now },
      }],
      default: [],
      /* Not select:false — the leads panel and admin console both read the raw
         document and would lose it silently. The protection is that no public
         projection includes it. */
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    // The leads panel's own lifecycle flag, independent of the WhatsApp
    // verification the onboarding app runs. 'removed' is written by the
    // owner's own "Delete this listing" in the Stay Partner app — see
    // `removeMyProperty` in `propertyEdit.controller.js` — and, like every
    // other value here, is a soft flag: the document is never dropped, so a
    // booking, payout or review made against this property before removal
    // still resolves everything it points at.
    status: {
      type: String,
      default: 'active'
    },
    // Set once, by `removeMyProperty`, alongside `status: 'removed'`. Null
    // for every property that has never been removed.
    removedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'properties',
    /* See the header: on, because the v1 update route passes req.body
       through unfiltered. Every field either frontend writes is declared
       above, so nothing is lost by it. */
    strict: true
  }
);

propertySchema.index({ name: 'text', place: 'text', ownerName: 'text', employeeEmail: 'text' });
/* The Explore grid always sorts newest first and filters by category. */
propertySchema.index({ createdAt: -1 });
propertySchema.index({ category: 1, createdAt: -1 });
/* Sparse, because most rows have no pin and a 2dsphere index that included
   them would refuse to build. Declared now rather than when the first geo
   query is written: the index is what makes `$near`/`$geoIntersects` possible
   at all, and adding it to a collection that has grown is the slow path. */
propertySchema.index({ location: '2dsphere' }, { sparse: true });

module.exports = mongoose.models.Property || mongoose.model('Property', propertySchema);

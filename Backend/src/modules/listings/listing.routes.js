const express = require('express');
const {
  getListings, getListingById, getListingReviews, getListingMeta, recordListingClick,
} = require('./listing.controller');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');
const { rateLimit } = require('../../shared/middleware/rateLimit');

const router = express.Router();

/* Public and unauthenticated — this is what lampose.com's Explore and Listing
   pages read, and what the mobile app's feed reads through /api/v2. */
router.get('/', requireLamposeDb, getListings);

/* BEFORE /:id, and it has to stay there. Express matches in declaration
   order, so with the parameter route first "meta" would be read as an id.
   That particular id fails the ObjectId shape test and answers a plain 404,
   which is the worst kind of wrong: the facets endpoint would look like it
   was never deployed rather than like it was shadowed. */
router.get('/meta', requireLamposeDb, getListingMeta);

/* Before `/:id` would also match — Express is first-match, and a literal
   segment after the id is a different route. Public, like the listing. */
router.get('/:id/reviews', requireLamposeDb, getListingReviews);

/* One tap on a property card. Public (guests count too) and deliberately
   cheap; the per-address cap is what stops a script from inflating a
   property's number — ordinary browsing never gets near 60 a minute. */
router.post(
  '/:id/click',
  rateLimit({ name: 'listing-click-ip', windowMs: 60 * 1000, max: 60 }),
  requireLamposeDb,
  recordListingClick,
);
router.get('/:id', requireLamposeDb, getListingById);

module.exports = router;

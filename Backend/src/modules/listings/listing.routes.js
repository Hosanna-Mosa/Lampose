const express = require('express');
const { getListings, getListingById, getListingMeta } = require('./listing.controller');
const { requireLamposeDb } = require('../../shared/middleware/requireDb');

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

router.get('/:id', requireLamposeDb, getListingById);

module.exports = router;

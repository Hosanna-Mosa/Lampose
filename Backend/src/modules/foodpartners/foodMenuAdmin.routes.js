/* ══════════════════════════════════════════════════════════════════════════
   /api/v1/admin/food-restaurants/:restaurantId/menu — a restaurant's menu,
   written by Lampose staff on the kitchen's behalf.

   Mounted INSIDE `foodAdmin.routes.js`, so `verifyAdminToken` and
   `requireLamposeDb` have already run. The caller is an administrator in
   `admins`; nothing here accepts a food-partner or restaurant-admin token.

   ## The handlers are the app's own

   Every route below calls the SAME function the Food-Partner app and the
   restaurant console call — `foodMenu.controller.js`. Those handlers read the
   restaurant from `req.foodPartner`, and `loadRestaurant` sets it from the
   URL, exactly as `requireRestaurantAdmin` sets it from a token. So a dish
   added here passes the same reader, the same limits, the same duplicate and
   discount checks and the same "a new sheet dish needs a photo" rule as one
   typed on the kitchen's tablet. A second copy of those rules for staff would
   be a second answer to the same question.

   What differs is only the door: the restaurant comes from the path (staff
   act on any kitchen), the guard is a capability (`food.menu.manage`), and
   every successful write is recorded in `admin_audit_log` as
   `food_menu.changed`, because an edit to somebody else's prices made by a
   person in our office is exactly the kind of thing an audit is for.

   ## Any restaurant, whatever its status

   Pending kitchens are the ones most likely to need a menu typed in for them
   — that is half of onboarding. Only an ERASED account (deleted by its owner)
   is refused, the same rule `requireFoodPartner` applies.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const multer = require('multer');

const FoodRestaurant = require('./foodRestaurant.model');
const {
  listMyProducts, createProduct, updateProduct, deleteProduct, setProductAvailability, bulkUpsertProducts,
} = require('./foodMenu.controller');
const { uploadFoodPartnerImages, FOOD_UPLOAD_LIMITS } = require('./foodUpload.controller');
const { can } = require('../iam/iam.middleware');
const { record } = require('../admins/adminAuditLog.model');
const { logError } = require('./foodPartner.log');

/* `mergeParams` so `:restaurantId` from the parent mount is readable here. */
const router = express.Router({ mergeParams: true });

const imageUpload = multer({ storage: multer.memoryStorage(), limits: FOOD_UPLOAD_LIMITS });

const MISSING = 'We could not find that restaurant.';

/** The restaurant in the URL, put where the shared menu handlers read it. */
const loadRestaurant = async (req, res, next) => {
  try {
    const restaurantId = String(req.params.restaurantId || '').trim().toUpperCase();
    const restaurant = restaurantId ? await FoodRestaurant.findOne({ restaurantId }) : null;
    if (!restaurant || (restaurant.deletion && restaurant.deletion.status === 'completed')) {
      return res.status(404).json({
        success: false, code: 'NOT_FOUND', message: MISSING, error: MISSING,
      });
    }
    req.foodPartner = restaurant;
    return next();
  } catch (error) {
    logError('loading a restaurant for a staff menu edit failed', error);
    return next(error);
  }
};

/**
 * Records a successful write in `admin_audit_log` once the reply is sent.
 *
 * Wraps `res.json` to see the handler's own answer rather than re-deriving
 * it: the created dish's id and a sheet's summary are only known there.
 * `record` swallows its own failures, so a log write can never fail the edit.
 */
const audited = (op) => (req, res, next) => {
  const send = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 300 && body && body.success !== false && !body.dryRun) {
      const data = (body && body.data) || {};
      const after = op === 'bulk'
        ? { op, created: data.created, updated: data.updated, unchanged: data.unchanged }
        : {
          op,
          productId: data.productId || req.params.productId || '',
          productName: data.productName || '',
          ...(op === 'availability' ? { isAvailable: data.isAvailable } : {}),
          ...(op === 'updated' && Array.isArray(body.changed) ? { changed: body.changed } : {}),
        };
      record(req, {
        action: 'food_menu.changed',
        targetType: 'food_restaurants',
        targetId: req.foodPartner ? req.foodPartner.restaurantId : req.params.restaurantId,
        after,
      });
    }
    return send(body);
  };
  next();
};

const manage = can('food.menu.manage');

/* Reading follows the console's rule for the queue: any signed-in admin. */
router.get('/', loadRestaurant, listMyProducts);

router.post('/', manage, loadRestaurant, audited('created'), createProduct);
/* The menu sheet. Same contract as the app's: adds and edits, never deletes. */
router.post('/bulk', manage, loadRestaurant, audited('bulk'), bulkUpsertProducts);

/* Dish photographs, foldered under this restaurant like the kitchen's own. */
router.post(
  '/uploads/images',
  manage,
  loadRestaurant,
  imageUpload.array('images', FOOD_UPLOAD_LIMITS.files),
  uploadFoodPartnerImages,
);

router.patch('/:productId', manage, loadRestaurant, audited('updated'), updateProduct);
router.patch('/:productId/availability', manage, loadRestaurant, audited('availability'), setProductAvailability);
router.delete('/:productId', manage, loadRestaurant, audited('deleted'), deleteProduct);

module.exports = router;

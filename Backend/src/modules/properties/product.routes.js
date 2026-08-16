/* ══════════════════════════════════════════════════════════════════════════
   Admin-console CRUD over the `products` collection.

   product.model.js was carried over from the leads backend merge with
   nothing routing to it (see that file's header comment). This gives the
   console the same list/create/edit/delete control over it that it already
   has over the collections that *are* wired up — Super-Admin-only, like the
   other database-management routes.
   ══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const router = express.Router();

const Product = require('./product.model');
const requireSuperAdmin = require('../../shared/middleware/requireSuperAdmin');

router.use(requireSuperAdmin);

// @route   GET /api/admin/products
router.get('/', async (req, res) => {
  try {
    const { search, inStock } = req.query;
    const query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (inStock === 'true') query.inStock = true;
    if (inStock === 'false') query.inStock = false;

    const items = await Product.find(query).sort({ createdAt: -1 });
    return res.json({ success: true, count: items.length, data: items, items });
  } catch (error) {
    console.error('❌ [GET /api/admin/products Error]:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching products.' });
  }
});

// @route   GET /api/admin/products/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await Product.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Product not found.' });
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error(`❌ [GET /api/admin/products/${req.params.id} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error fetching product.' });
  }
});

// @route   POST /api/admin/products
router.post('/', async (req, res) => {
  try {
    const { name, description, price, inStock } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Product name is required.' });

    const created = await Product.create({
      name,
      description: description || '',
      price: Number(price) || 0,
      inStock: inStock === undefined ? true : Boolean(inStock),
    });

    console.log(`✅ [Product Created] "${created.name}" (${created._id})`);
    return res.status(201).json({ success: true, message: 'Product created.', data: created });
  } catch (error) {
    console.error('❌ [POST /api/admin/products Error]:', error.message);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    return res.status(500).json({ success: false, message: error.message || 'Error creating product.' });
  }
});

// @route   PUT /api/admin/products/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, description, price, inStock } = req.body;
    const changes = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { price: Number(price) }),
      ...(inStock !== undefined && { inStock: Boolean(inStock) }),
    };

    const updated = await Product.findByIdAndUpdate(req.params.id, changes, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Product not found.' });

    console.log(`✏️ [Product Updated] "${updated.name}" (${req.params.id})`);
    return res.json({ success: true, message: 'Product updated.', data: updated });
  } catch (error) {
    console.error(`❌ [PUT /api/admin/products/${req.params.id} Error]:`, error.message);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    return res.status(500).json({ success: false, message: error.message || 'Error updating product.' });
  }
});

// @route   DELETE /api/admin/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Product not found.' });

    console.log(`🗑️ [Product Deleted] "${deleted.name}" (${req.params.id})`);
    return res.json({ success: true, message: 'Product deleted.' });
  } catch (error) {
    console.error(`❌ [DELETE /api/admin/products/${req.params.id} Error]:`, error.message);
    return res.status(500).json({ success: false, message: error.message || 'Error deleting product.' });
  }
});

module.exports = router;

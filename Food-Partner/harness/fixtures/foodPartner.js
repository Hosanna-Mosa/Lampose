/* Stands in for services/foodPartner.ts.

   Mocked at the SERVICE boundary, not at fetch. Mocking global.fetch would leave
   500 lines of payload shaping in the render path — real coverage, but then every
   screen's tree depends on JSON shaped like the backend, and a backend shape drift
   would read as a UI regression. The service boundary is the seam the refactor
   does not cross.

   The two pure helpers stay REAL: they are logic, not I/O, and faking them would
   be mocking app source (F9). */
const D = require('./data');

const profile = () => global.__SNAP_PROFILE__ || 'resolved';
const boom = () => Promise.reject(Object.assign(
  new Error('The request timed out. Check your connection.'), { status: 0 }));
const give = (v) => jest.fn(() => (profile() === 'error' ? boom() : Promise.resolve(
  typeof v === 'function' ? v() : v)));

const actual = () => jest.requireActual('@/services/foodPartner');

module.exports = {
  // ── real, pure, in the render path ──
  get buildApplicationPayload() { return actual().buildApplicationPayload; },
  get productBody() { return actual().productBody; },

  // ── I/O ──
  startPhoneOtp: give({ ok: true }),
  verifyPhoneOtp: give({ proof: 'seed-proof' }),
  submitApplication: give({ restaurantId: 'r_seed_1', token: 'seed-token', verificationStatus: 'pending' }),
  login: give({ token: 'seed-token', restaurant: D.RESTAURANT }),
  getMe: give(() => D.RESTAURANT),
  updateMe: give({ ok: true }),
  setAvailability: give({ ok: true }),
  listMyProducts: give(() => D.PRODUCTS),
  createProduct: give({ ok: true }),
  updateProduct: give({ ok: true }),
  deleteProduct: give({ ok: true }),
  setProductAvailability: give({ ok: true }),
  registerDevice: give({ ok: true }),
  unregisterDevice: give({ ok: true }),
  listMyOrders: give(() => D.ORDERS_PAGE),
  setOrderStatus: give({ ok: true }),
};

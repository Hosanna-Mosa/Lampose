module.exports = {
  alertSound: {
    primeOrderSound: jest.fn(async () => {}),
    playNewOrderAlert: jest.fn(async () => {}),
    releaseOrderSound: jest.fn(),
  },
  orderAlerts: {
    ORDER_CHANNEL: 'food-orders',
    ensureOrderChannel: jest.fn(async () => {}),
    /* Returns null on a simulator and on a refused permission in the real app
       too — so null is the honest value, not a degraded one. */
    getPushToken: jest.fn(async () => null),
  },
};

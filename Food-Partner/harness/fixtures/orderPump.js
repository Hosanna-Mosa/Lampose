/* Stands in for services/orderPump.ts — module-level state (subscribers,
   acknowledged, sheetShowing) that would otherwise leak between cases, plus a
   polling loop and a socket. Listener registration returns a no-op unsubscribe
   so effects can still clean up honestly. */
module.exports = {
  lastArrival: jest.fn(() => null),
  cancelledOrders: jest.fn(() => []),
  clearCancelledOrders: jest.fn(),
  setSheetOpen: jest.fn(),
  isSheetOpen: jest.fn(() => false),
  acknowledgeOrder: jest.fn(),
  isAcknowledged: jest.fn(() => false),
  onNewOrder: jest.fn(() => () => {}),
  onQueueChanged: jest.fn(() => () => {}),
  onSessionExpired: jest.fn(() => () => {}),
  startOrderPump: jest.fn(() => () => {}),
};

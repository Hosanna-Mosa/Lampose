/* Stands in for services/orderSocket.ts. Realtime is an optimisation, never a
   dependency — so a harness in which it does nothing is a faithful harness. */
module.exports = {
  connectOrderSocket: jest.fn(() => null),
  onSocketEvent: jest.fn(() => () => {}),
  emitSocket: jest.fn(),
  onOrderPlaced: jest.fn(() => () => {}),
  onDispatchUpdate: jest.fn(() => () => {}),
  onUnauthorised: jest.fn(() => () => {}),
  disconnectOrderSocket: jest.fn(),
};

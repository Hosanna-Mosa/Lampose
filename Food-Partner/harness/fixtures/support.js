/* Stands in for services/support.ts.

   Everything pure stays REAL — CATEGORY_LABEL, categoryWords, STATUS_WORD and
   BODY_MAX_FALLBACK are rendered directly by the support screens, so faking them
   would change the tree under test rather than isolate it. Only the network calls
   and the two socket watchers are replaced. */
const D = require('./data');

const profile = () => global.__SNAP_PROFILE__ || 'resolved';
const boom = () => Promise.reject(Object.assign(
  new Error('The request timed out. Check your connection.'), { status: 0 }));
const give = (v) => jest.fn(() => (profile() === 'error' ? boom() : Promise.resolve(
  typeof v === 'function' ? v() : v)));

const actual = jest.requireActual('@/services/support');

module.exports = {
  // ── real, pure, rendered directly ──
  CATEGORY_LABEL: actual.CATEGORY_LABEL,
  categoryWords: actual.categoryWords,
  STATUS_WORD: actual.STATUS_WORD,
  BODY_MAX_FALLBACK: actual.BODY_MAX_FALLBACK,

  // ── I/O ──
  fetchCategories: give(() => D.audience()),
  listTickets: give(() => D.TICKETS_PAGE),
  fetchTicket: give(() => D.THREAD),
  createTicket: give(() => D.THREAD),
  replyToTicket: give(() => D.THREAD.messages[2]),
  markTicketRead: give(undefined),
  watchTicket: jest.fn(() => () => {}),
  watchSupport: jest.fn(() => () => {}),
};

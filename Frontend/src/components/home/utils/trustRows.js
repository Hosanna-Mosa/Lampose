import { TICKER_FWD, TICKER_REV } from '../../../data/home';

export const ROWS = {
  claims: { items: TICKER_FWD, dir: 'fwd' },
  places: { items: TICKER_REV, dir: 'rev' },
};

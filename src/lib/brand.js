import { IS_DEMO } from './db.js';
import { DEMO_OWN_BRAND } from './demo/constants.js';

// Guarded like db.js so plain Node can import this file too.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

// The app's name, shown as the wordmark and in titles. Set VITE_APP_NAME to
// rename your copy.
export const APP_NAME = (env.VITE_APP_NAME || 'Swipefile').trim() || 'Swipefile';

// Which brand is *yours*. Set VITE_OWN_BRAND in .env (e.g. "acme labs") so the
// dashboard can split your own ads from competitors'. Comparison is
// case-insensitive against the ad's `brand` field. When unset, nothing is
// treated as yours: the competitor views still work, the "ours" views are
// simply empty. Demo mode uses the sample brand.
export const OWN_BRAND_NAME = (env.VITE_OWN_BRAND || (IS_DEMO ? DEMO_OWN_BRAND : '')).trim();
export const OWN_BRAND = OWN_BRAND_NAME.toLowerCase();

export const isOwnBrand = (brand) =>
  Boolean(OWN_BRAND) && (brand || '').trim().toLowerCase() === OWN_BRAND;

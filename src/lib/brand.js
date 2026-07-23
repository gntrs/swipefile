// Which brand is *yours*. Set VITE_OWN_BRAND in .env (e.g. "acme labs") so the
// dashboard can split your own ads from competitors'. Comparison is
// case-insensitive against the ad's `brand` field. When unset, nothing is
// treated as yours - the competitor views still work, the "ours" views are
// simply empty.
export const OWN_BRAND = (import.meta.env.VITE_OWN_BRAND || '').trim().toLowerCase();

export const isOwnBrand = (brand) =>
  Boolean(OWN_BRAND) && (brand || '').trim().toLowerCase() === OWN_BRAND;

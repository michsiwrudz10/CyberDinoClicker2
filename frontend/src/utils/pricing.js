export const PRICE_GROWTH = 1.4;
export const PURCHASE_PRICE_MULT = 77;

export function fmt(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return Math.floor(n).toString();
}

export function adjustBaseCost(base) {
  if (base <= 150) return Math.max(1, Math.round(base * 0.05));
  if (base <= 1000) return Math.max(1, Math.round(base * 0.2));
  if (base <= 50000) return Math.round(base);
  if (base <= 500000) return Math.round(base * 3);
  return Math.round(base * 10);
}

export function getPrice(baseCost, ownedCount) {
  const adjusted = adjustBaseCost(baseCost);
  const grown = Math.floor(adjusted * Math.pow(PRICE_GROWTH, ownedCount));
  const finalPrice = Math.max(1, Math.floor(grown * PURCHASE_PRICE_MULT));
  return finalPrice;
}
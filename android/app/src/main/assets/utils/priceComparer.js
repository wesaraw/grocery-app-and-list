export function pricePerUnit(price, qty) {
  const p = parseFloat(price.replace(/[^0-9.]/g, ''));
  const q = parseFloat(qty);
  if (isNaN(p) || isNaN(q) || q === 0) return null;
  return p / q;
}

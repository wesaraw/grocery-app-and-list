import { UNIT_ALIASES, normalizeUnit, parseUnitPrice } from './unitUtils.js';
export { UNIT_ALIASES, normalizeUnit, parseUnitPrice };

export const SHEET_SQFT = 0.111;
export const TOWEL_SHEET_SQFT = 0.451;

export function sheetSqFtFor(name = '') {
  return /paper\s*towels?/i.test(name) ? TOWEL_SHEET_SQFT : SHEET_SQFT;
}

export function parsePriceNumber(text) {
  if (!text) return null;
  text = text.replace(/[^\x00-\x7F]+/g, '');
  const m = text.match(/[0-9]+(?:\.[0-9]+)?/);
  return m ? parseFloat(m[0]) : null;
}


export function getPriceUnitInfo(product) {
  if (product.pricePerUnit != null && product.unitType) {
    return { pricePerUnit: product.pricePerUnit, unitType: product.unitType };
  }
  const parsed = parseUnitPrice(product.unit);
  if (parsed) return parsed;
  return { pricePerUnit: null, unitType: null };
}

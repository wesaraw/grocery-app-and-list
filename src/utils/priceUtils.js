export const SHEET_SQFT = 0.111;
export const TOWEL_SHEET_SQFT = 0.451;

export const UNIT_ALIASES = {
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  perpound: 'lb',
  perlb: 'lb',
  floz: 'oz',
  fluidounce: 'oz',
  flounce: 'oz',
  ga: 'gal',
  gl: 'gal',
  quart: 'qt',
  quarts: 'qt',
  perquart: 'qt',
  pint: 'pt',
  pints: 'pt',
  perpint: 'pt',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  doz: 'doz',
  dozen: 'doz',
  dozens: 'doz',
  'halfdoz': 'halfdoz',
  'half-doz': 'halfdoz',
  halfdozen: 'halfdoz',
  'half-dozen': 'halfdoz'
};

export function normalizeUnit(unit) {
  if (!unit) return unit;
  const key = unit.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  return UNIT_ALIASES[key] || key;
}

export function sheetSqFtFor(name = '') {
  return /paper\s*towels?/i.test(name) ? TOWEL_SHEET_SQFT : SHEET_SQFT;
}

export function parsePriceNumber(text) {
  if (!text) return null;
  text = text.replace(/[^\x00-\x7F]+/g, '');
  // Prefer a number that includes a decimal point as those are
  // less likely to be concatenated digits (e.g. `1268` vs `12.68`).
  let m = text.match(/([0-9]+\.[0-9]+)/);
  if (m) return parseFloat(m[1]);

  // Fall back to a number that directly follows a dollar sign
  // (handles formats like "$12" without cents).
  m = text.match(/\$\s*([0-9]+)/);
  if (m) return parseFloat(m[1]);

  m = text.match(/[0-9]+/);
  return m ? parseFloat(m[0]) : null;
}

export function parseUnitPrice(text) {
  if (!text) return null;
  text = text.trim();
  const hadCent = /\u00A2/.test(text);
  text = text.replace(/[^\x00-\x7F]+/g, '');
  const paren = text.match(/\(([^()]+)\)/);
  if (paren) {
    const inner = parseUnitPrice(paren[1].trim());
    if (inner) return inner;
  }
  text = text.replace(/[()]/g, '');

  let m = text.match(/\$([\d.]+)\s*for\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\.\-]+)/i);
  if (m) {
    const price = parseFloat(m[1]);
    const qty = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.\-]+/g, '');
    unitType = normalizeUnit(unitType);
    if (!isNaN(price) && !isNaN(qty) && qty !== 0) {
      return { pricePerUnit: price / qty, unitType, unitQty: qty };
    }
  }

  m = text.match(/\$([\d.]+)\s*\/\s*(\d+)([a-zA-Z\.\-]+)/);
  if (m) {
    const price = parseFloat(m[1]);
    const qty = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.\-]+/g, '');
    unitType = normalizeUnit(unitType);
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/\$([\d.]+)\s*\/\s*([\d.]*)\s*([a-zA-Z\.\-]+(?:\s*[a-zA-Z\.\-]+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    const qtyVal = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.\-]+/g, '');
    unitType = normalizeUnit(unitType);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/price\s*per\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\.\-]+(?:\s*[a-zA-Z\.\-]+)*)\s*\$([\d.]+)/i);
  if (m) {
    const qtyVal = parseFloat(m[1]);
    let unitType = m[2].toLowerCase().replace(/[\s.\-]+/g, '');
    unitType = normalizeUnit(unitType);
    const price = parseFloat(m[3]);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/price\s*per\s*([\d.]+)\s*([a-zA-Z\.\-]+)\s*\$([\d.]+)/i);
  if (m) {
    const qtyVal = parseFloat(m[1]);
    let unitType = m[2].toLowerCase().replace(/[\s.\-]+/g, '');
    unitType = normalizeUnit(unitType);
    const price = parseFloat(m[3]);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/([\d.]+)\s*\/\s*([\d.]*)\s*([a-zA-Z\.\-]+(?:\s*[a-zA-Z\.\-]+)?)/);
  if (m) {
    let price = parseFloat(m[1]);
    if (hadCent) price = price / 100;
    const qtyVal = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.\-]+/g, '');
    unitType = normalizeUnit(unitType);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  return null;
}

export function getPriceUnitInfo(product) {
  if (product.pricePerUnit != null && product.unitType) {
    return { pricePerUnit: product.pricePerUnit, unitType: product.unitType };
  }
  const parsed = parseUnitPrice(product.unit);
  if (parsed) return parsed;
  return { pricePerUnit: null, unitType: null };
}

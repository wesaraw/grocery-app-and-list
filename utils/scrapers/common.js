export const UNIT_FACTORS = {
  oz: 1,
  floz: 1,
  lb: 16,
  g: 0.035274,
  kg: 35.274,
  ml: 0.033814,
  l: 33.814,
  gal: 128,
  ga: 128,
  qt: 32,
  pt: 16,
  cup: 8,
  tbsp: 0.5,
  tsp: 0.1667,
  ea: 1,
  ct: 1,
  count: 1,
  pkg: 1,
  box: 1,
  can: 1,
  bag: 1,
  bottle: 1,
  stick: 1,
  roll: 1,
  bar: 1,
  pouch: 1,
  jar: 1,
  packet: 1,
  sleeve: 1,
  slice: 1,
  piece: 1,
  tube: 1,
  tray: 1,
  unit: 1
};

export const WEIGHT_UNITS = new Set([
  'oz',
  'floz',
  'lb',
  'kg',
  'g',
  'ml',
  'l',
  'gal',
  'ga',
  'qt',
  'pt',
  'cup',
  'tbsp',
  'tsp'
]);

export const VOLUME_UNITS = new Set([
  'floz',
  'ml',
  'l',
  'gal',
  'ga',
  'qt',
  'pt',
  'cup',
  'tbsp',
  'tsp'
]);

export const COUNT_UNITS = new Set([
  'ea',
  'ct',
  'count',
  'pkg',
  'box',
  'can',
  'bag',
  'bottle',
  'stick',
  'roll',
  'bar',
  'pouch',
  'jar',
  'packet',
  'sleeve',
  'slice',
  'piece',
  'tube',
  'tray',
  'unit'
]);

export function sanitize(str) {
  return str
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchPack(str) {
  if (!str) return null;
  const s = sanitize(str);
  return (
    s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i) ||
    s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i) ||
    s.match(/pack\s*of\s*(\d+)/i) ||
    s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i)
  );
}

export function getPackCount(name, size, unit) {
  let m = matchPack(name);
  if (!m) m = matchPack(size);
  if (!m) m = matchPack(unit);
  return m ? parseInt(m[1], 10) : 1;
}

/**
 * Shared scraping utilities reused across store scrapers.
 *
 * The helpers below consolidate logic previously duplicated in individual
 * scraper implementations inside `Version Old/scrapers/*`.  See
 * "Version 2.0 Upgrade Notes/Scraper Profiling.txt" for examples of how
 * each store uses these utilities.
 */
// -------------------------
// Unit conversion constants
// -------------------------
/** Map of unit to equivalent ounces. */
const UNIT_FACTORS = {
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
/** Weight/volume units which can be converted to ounces. */
const WEIGHT_UNITS = new Set([
    'oz',
    'floz',
    'lb',
    'kg',
    'ml',
    'l',
    'gal',
    'ga',
    'g',
    'qt',
    'pt',
    'cup',
    'tbsp',
    'tsp'
]);
/** Count-based units that do not convert to weight. */
const COUNT_UNITS = new Set([
    'ea',
    'ct',
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
// -----------------------------
// Unit aliasing/normalization
// -----------------------------
/** Mapping of verbose unit names to canonical abbreviations. */
const UNIT_ALIASES = {
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
/**
 * Normalize a unit string by lowercasing, removing spaces/periods, and
 * applying known aliases.  Used by all scrapers when interpreting size and
 * price-per-unit values.
 */
function normalizeUnit(unit) {
    if (!unit)
        return unit ?? null;
    const key = unit.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
    return UNIT_ALIASES[key] || key;
}
// --------------------
// Text cleanup helpers
// --------------------
/**
 * Remove HTML tags, non-breaking spaces, and excess whitespace from text.
 *
 * Hannaford, Roche Bros, Shaw's, Stop & Shop, and Walmart all relied on this
 * cleanup step before detecting pack counts or units (see "Scraper Profiling.txt").
 */
function sanitizeText(str) {
    return (str
        ?.replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim() ?? '');
}
/**
 * Attempt to locate a pack-size expression within a string.
 *
 * The regex covers formats observed across stores such as "12-pack",
 * "pack of 6", or "3×12".  Individual stores may supply additional
 * expressions via strategy overrides.
 */
function matchPack(str) {
    if (!str)
        return null;
    const s = sanitizeText(str);
    return (s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i) ||
        s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i) ||
        s.match(/pack\s*of\s*(\d+)/i) ||
        s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i));
}
/**
 * Derive the number of items in a multipack by inspecting the product
 * name, size description, and unit text.
 */
function getPackCount(name, size, unit) {
    let m = matchPack(name);
    if (!m)
        m = matchPack(size);
    if (!m)
        m = matchPack(unit);
    return m ? parseInt(m[1], 10) : 1;
}
// ----------------------
// Price parsing helpers
// ----------------------
/**
 * Parse the first dollar amount from an arbitrary text string.  Prefer
 * values containing decimals to avoid concatenated digits (e.g. "1268" vs
 * "12.68").  Used by Amazon, Hannaford, and Walmart scrapers.
 */
function parsePriceNumber(text) {
    if (!text)
        return null;
    text = text.replace(/[^\x00-\x7F]+/g, '');
    let m = text.match(/([0-9]+\.[0-9]+)/);
    if (m)
        return parseFloat(m[1]);
    m = text.match(/\$\s*([0-9]+)/);
    if (m)
        return parseFloat(m[1]);
    m = text.match(/[0-9]+/);
    return m ? parseFloat(m[0]) : null;
}
/**
 * Parse common "price per unit" strings such as "$3.99 / 2 lb" or
 * "5.5¢/oz".  Cent-sign handling and other quirks are documented in
 * "Scraper Profiling.txt" under store-specific sections.
 */
function parseUnitPrice(text) {
    if (!text)
        return null;
    text = text.trim();
    const hadCent = /\u00A2/.test(text);
    text = text.replace(/[^\x00-\x7F]+/g, '');
    const paren = text.match(/\(([^()]+)\)/);
    if (paren) {
        const inner = parseUnitPrice(paren[1].trim());
        if (inner)
            return inner;
    }
    text = text.replace(/[()]/g, '');
    let m = text.match(/\$([\d.]+)\s*for\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\.\-]+)/i);
    if (m) {
        const price = parseFloat(m[1]);
        const qty = parseFloat(m[2]);
        let unitType = m[3].toLowerCase().replace(/[\s.\-]+/g, '');
        unitType = normalizeUnit(unitType) ?? unitType;
        if (!isNaN(price) && !isNaN(qty) && qty !== 0) {
            return { pricePerUnit: price / qty, unitType, unitQty: qty };
        }
    }
    m = text.match(/\$([\d.]+)\s*\/\s*(\d+)([a-zA-Z\.\-]+)/);
    if (m) {
        const price = parseFloat(m[1]);
        const qty = parseFloat(m[2]);
        let unitType = m[3].toLowerCase().replace(/[\s.\-]+/g, '');
        unitType = normalizeUnit(unitType) ?? unitType;
        return { pricePerUnit: price / qty, unitType, unitQty: qty };
    }
    m = text.match(/\$([\d.]+)\s*\/\s*([\d.]*)\s*([a-zA-Z\.\-]+(?:\s*[a-zA-Z\.\-]+)?)/);
    if (m) {
        const price = parseFloat(m[1]);
        const qtyVal = parseFloat(m[2]);
        let unitType = m[3].toLowerCase().replace(/[\s.\-]+/g, '');
        unitType = normalizeUnit(unitType) ?? unitType;
        const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        return { pricePerUnit: price / qty, unitType, unitQty: qty };
    }
    m = text.match(/price\s*per\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\.\-]+(?:\s*[a-zA-Z\.\-]+)*)\s*\$([\d.]+)/i);
    if (m) {
        const qtyVal = parseFloat(m[1]);
        let unitType = m[2].toLowerCase().replace(/[\s.\-]+/g, '');
        unitType = normalizeUnit(unitType) ?? unitType;
        const price = parseFloat(m[3]);
        const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        return { pricePerUnit: price / qty, unitType, unitQty: qty };
    }
    m = text.match(/price\s*per\s*([\d.]+)\s*([a-zA-Z\.\-]+)\s*\$([\d.]+)/i);
    if (m) {
        const qtyVal = parseFloat(m[1]);
        let unitType = m[2].toLowerCase().replace(/[\s.\-]+/g, '');
        unitType = normalizeUnit(unitType) ?? unitType;
        const price = parseFloat(m[3]);
        const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        return { pricePerUnit: price / qty, unitType, unitQty: qty };
    }
    m = text.match(/([\d.]+)\s*\/\s*([\d.]*)\s*([a-zA-Z\.\-]+(?:\s*[a-zA-Z\.\-]+)?)/);
    if (m) {
        let price = parseFloat(m[1]);
        if (hadCent)
            price = price / 100;
        const qtyVal = parseFloat(m[2]);
        let unitType = m[3].toLowerCase().replace(/[\s.\-]+/g, '');
        unitType = normalizeUnit(unitType) ?? unitType;
        const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        return { pricePerUnit: price / qty, unitType, unitQty: qty };
    }
    return null;
}
// --------------------------------------
// DOM selector fallback helper
// --------------------------------------
/**
 * Try a list of selectors and return the first matching element.  Useful
 * for stores that change class names frequently (e.g., Amazon's search
 * result tiles) – see "Scraper Profiling.txt" for selector sets.
 */
function selectOne(root, selectors) {
    for (const sel of selectors) {
        const el = root.querySelector(sel);
        if (el)
            return el;
    }
    return null;
}
/** Registry of strategies for known stores.  Scrapers can register their
 * overrides at startup using {@link registerStoreStrategy} and query them via
 * {@link getStoreStrategy}.  Examples of overrides include Walmart's split
 * price markup or Stop & Shop's cent-sign unit prices (see "Scraper Profiling.txt").
 */
const storeStrategies = {};
function registerStoreStrategy(id, strategy) {
    storeStrategies[id] = strategy;
}
function getStoreStrategy(id) {
    return storeStrategies[id] || {};
}

export { COUNT_UNITS, UNIT_ALIASES, UNIT_FACTORS, WEIGHT_UNITS, getPackCount, getStoreStrategy, matchPack, normalizeUnit, parsePriceNumber, parseUnitPrice, registerStoreStrategy, sanitizeText, selectOne, storeStrategies };
//# sourceMappingURL=common.js.map

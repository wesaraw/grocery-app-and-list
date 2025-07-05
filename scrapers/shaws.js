import { getImageSrc } from "../utils/imageUtils.js";
export function scrapeShaws() {
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

  const WEIGHT_UNITS = new Set([
    'oz',
    'floz',
    'lb',
    'kg',
    'ml',
    'l',
    'gal',
    'g',
    'qt',
    'pt',
    'cup',
    'tbsp',
    'tsp'
  ]);

  const COUNT_UNITS = new Set([
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

  function extractSize(text) {
    if (!text) return [null, null];
    const regex = /([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|count|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/gi;
    let weightPair = null;
    let countPair = null;
    for (const m of text.matchAll(regex)) {
      let unit = m[2].toLowerCase().replace(/\s+/g, '');
      if (unit === 'floz') unit = 'oz';
      else if (unit === 'count') unit = 'ct';
      const qty = parseFloat(m[1]);
      if (WEIGHT_UNITS.has(unit)) {
        if (!weightPair) weightPair = [qty, unit];
      } else if (COUNT_UNITS.has(unit)) {
        if (!countPair) countPair = [qty, unit];
      }
    }
    return weightPair || countPair || [null, null];
  }

  const products = [];
  const tiles = document.querySelectorAll('product-item-al-v2');
  tiles.forEach(tile => {
    const titleEl = tile.querySelector('[data-qa="prd-itm-pttl"]');
    const name = titleEl?.innerText?.trim();
    const linkRel = titleEl?.getAttribute('href');
    const link = linkRel ? new URL(linkRel, 'https://www.shaws.com').href : '';
    const priceText = tile.querySelector('[data-qa="prd-itm-prc"]')?.innerText?.trim();
    const sizeText = tile.querySelector('[data-qa="prd-itm-sqty"]')?.innerText?.trim();
    const image = getImageSrc(tile.querySelector('img[data-qa="prd-itm-img"]'));

    let priceNumber = null;
    if (priceText) {
      const p = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }

    let sizeQty = null;
    let sizeUnit = null;

    [sizeQty, sizeUnit] = extractSize(sizeText);

    if (sizeQty == null && name) {
      [sizeQty, sizeUnit] = extractSize(name);
    }

    let convertedQty = null;
    let pricePerUnit = null;
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null) {
          pricePerUnit = priceNumber / convertedQty;
        }
      }
    }

    if (name && priceText) {
      products.push({
        name,
        price: priceText,
        priceNumber,
        size: sizeText || '',
        sizeQty,
        sizeUnit,
        unit: '',
        unitQty: null,
        unitType: null,
        convertedQty,
        pricePerUnit,
        image,
        link
      });
    }
  });
  return products;
}

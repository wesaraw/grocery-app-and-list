import { getImageSrc } from "../utils/imageUtils.js";
import { parsePriceNumber } from "../utils/priceUtils.js";
export function scrapeStopAndShop() {
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

  const products = [];
  const tiles = document.querySelectorAll('li.tile.product-cell.product-grid-cell');
  tiles.forEach(tile => {
    const name = tile.querySelector('.product-grid-cell_price-container > .sr-only')?.innerText?.trim();

    const priceText = tile.querySelector('.product-grid-cell_main-price')?.innerText?.trim();

    const unitSize = tile.querySelector('.product-grid-cell_size')?.innerText?.trim();

    const perUnitText = tile.querySelector('.product-grid-cell_unit')?.innerText?.trim();

    const image = getImageSrc(tile.querySelector('img'));

    const packMatch =
      name?.match(/(?:pack\s*of\s*)?(\d+)\s*(?:pk|pack|ct|count|rolls?)/i) ||
      name?.match(/(\d+)\s*[xX]/);
    const packCount = packMatch ? parseInt(packMatch[1], 10) : 1;

    let unitQty = null;
    let unitType = null;
    if (perUnitText) {
      const clean = perUnitText.replace(/[^0-9./a-zA-Z]/g, '');
      const match = clean.match(/([\d.]+)\/(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
      if (match) {
        unitQty = parseFloat(match[1]);
        unitType = match[2].toLowerCase().replace(/\s+/g, '');
        if (unitType === 'floz') unitType = 'oz';
      }
    }

    let priceNumber = null;
    if (priceText) {
      const p = parsePriceNumber(priceText);
      if (!isNaN(p)) priceNumber = p;
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (unitSize) {
      const m = unitSize.match(/([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
      if (m) {
        sizeQty = parseFloat(m[1]);
        sizeUnit = m[2].toLowerCase().replace(/\s+/g, '');
        if (sizeUnit === 'floz') sizeUnit = 'oz';
      }
    }

    let convertedQty = null;
    let pricePerUnit = null;

    if (perUnitText) {
      let m = perUnitText.match(/\$([\d.]+)\/?\s*([\d.]*)\s*(\w+)/);
      let priceVal = null;
      let qtyVal = null;
      if (m) {
        priceVal = parseFloat(m[1]);
        qtyVal = parseFloat(m[2]);
        unitType = m[3].toLowerCase().replace(/\s+/g, '');
      } else {
        m = perUnitText.match(/([\d.]+)\s*¢\/?\s*([\d.]*)\s*(\w+)/);
        if (m) {
          priceVal = parseFloat(m[1]) / 100;
          qtyVal = parseFloat(m[2]);
          unitType = m[3].toLowerCase().replace(/\s+/g, '');
        }
      }
      if (m) {
        if (unitType === 'floz') unitType = 'oz';
        const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        pricePerUnit = priceVal / qty;
        const factor = UNIT_FACTORS[unitType];
        if (factor && !COUNT_UNITS.has(unitType)) {
          pricePerUnit = pricePerUnit / factor;
          unitType = 'oz';
        }
        unitQty = qty;
      }
    }

    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        if (!COUNT_UNITS.has(sizeUnit.toLowerCase())) {
          convertedQty = sizeQty * factor;
          unitType = 'oz';
          if (priceNumber != null && pricePerUnit == null) {
            const totalConverted = convertedQty * packCount;
            pricePerUnit = priceNumber / totalConverted;
          }
        } else {
          if (!unitType) unitType = sizeUnit.toLowerCase();
          if (priceNumber != null && pricePerUnit == null) {
            const totalCount = sizeQty * packCount;
            pricePerUnit = priceNumber / totalCount;
          }
        }
      }
    }

    if (name && priceText) {
      products.push({
        name,
        price: priceText,
        priceNumber,
        size: unitSize || '',
        sizeQty,
        sizeUnit,
        unit: perUnitText || '',
        unitQty,
        unitType,
        convertedQty,
        pricePerUnit,
        packCount,
        image,
        link
      });
    }
  });
  return products;
}

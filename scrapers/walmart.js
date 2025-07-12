import { getImageSrc } from "../utils/imageUtils.js";
import { parsePriceNumber, normalizeUnit, parseUnitPrice } from "../utils/priceUtils.js";
export function scrapeWalmart() {
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

  function sanitize(str) {
    return str
      ?.replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchPack(str) {
    if (!str) return null;
    const s = sanitize(str);
    return (
      s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i) ||
      s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i) ||
      s.match(/pack\s*of\s*(\d+)/i) ||
      s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i)
    );
  }

  function getPackCount(name, size, unit) {
    let m = matchPack(name);
    if (!m) m = matchPack(size);
    if (!m) m = matchPack(unit);
    return m ? parseInt(m[1], 10) : 1;
  }

  const products = [];
  const tiles = document.querySelectorAll('[data-testid="list-view"] > div');
  tiles.forEach((tile, i) => {
    const name = tile.querySelector('[data-automation-id="product-title"]')?.innerText?.trim();
    const packCount = getPackCount(name, null, null);
    const priceMatch = tile.querySelector('[data-automation-id="product-price"]')?.innerText?.match(/\$?\d+\.\d{2}/);
    const price = priceMatch ? priceMatch[0] : null;
    const perUnitTextRaw =
      tile.querySelector('[data-testid="product-price-per-unit"]')?.innerText?.trim() ||
      tile.querySelector('.gray')?.innerText?.trim();
    const perUnitTextSanitized = perUnitTextRaw?.replace(/[^\x00-\x7F]+/g, '');
    let pricePerUnit = null;
    let unitType = null;
    let sizeQty = null;
    let sizeUnit = null;
    let convertedQty = null;
    let unitQty = null;

    const sizeMatch = name?.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lb|g|kg|ml|l|ct)/i);
    if (sizeMatch) {
      sizeQty = parseFloat(sizeMatch[1]);
      sizeUnit = normalizeUnit(sizeMatch[2]);
      const factor = UNIT_FACTORS[sizeUnit];
      if (factor) {
        sizeQty = sizeQty * packCount;
        if (!COUNT_UNITS.has(sizeUnit)) {
          convertedQty = sizeQty * factor;
          unitType = sizeUnit === 'floz' ? 'floz' : 'oz';
          unitQty = 1;
          if (price) {
            const p = parseFloat(price.replace(/[^0-9.]/g, ''));
            if (!isNaN(p)) {
              pricePerUnit = p / convertedQty;
            }
          }
        } else {
          convertedQty = sizeQty;
          unitType = sizeUnit;
          unitQty = 1;
          if (price) {
            const p = parseFloat(price.replace(/[^0-9.]/g, ''));
            if (!isNaN(p) && convertedQty > 0) {
              pricePerUnit = p / convertedQty;
            }
          }
        }
      }
    }

    if (pricePerUnit == null && perUnitTextRaw) {
      const parsed = parseUnitPrice(perUnitTextRaw);
      if (parsed) {
        pricePerUnit = parsed.pricePerUnit;
        unitType = parsed.unitType;
        unitQty = parsed.unitQty;
        const factor = UNIT_FACTORS[unitType];
        if (factor && !COUNT_UNITS.has(unitType)) {
          pricePerUnit = pricePerUnit / factor;
          if (unitType !== 'floz') {
            unitType = 'oz';
          }
        }
      }
    }

    if (pricePerUnit == null && price) {
      const sheetMatch = name?.match(/(\d+)\s*sheets?\s*per\s*roll/i);
      if (sheetMatch) {
        const sheetsPerRoll = parseInt(sheetMatch[1], 10);
        const totalSheets = sheetsPerRoll * (packCount || 1);
        const p = parseFloat(price.replace(/[^0-9.]/g, ''));
        if (!isNaN(p) && totalSheets > 0) {
          pricePerUnit = p / totalSheets;
          unitType = 'sheet';
        }
      }
    }
    const image = getImageSrc(tile.querySelector('img[data-testid="productTileImage"]'));
    const link = tile.querySelector('a[href*="/ip/"]')?.href || '';
    let priceNumber = null;
    if (price) {
      const p = parsePriceNumber(price);
      if (!isNaN(p)) priceNumber = p;
    }
    if (name && price) {
      products.push({
        name,
        price,
        priceNumber,
        size: '',
        sizeQty,
        sizeUnit,
        unit: perUnitTextSanitized || '',
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

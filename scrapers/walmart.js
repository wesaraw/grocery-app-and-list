import { getImageSrc } from "../utils/imageUtils.js";
import { parsePriceNumber, parseUnitPrice } from "../utils/priceUtils.js";
import { roundQuantity } from "../utils/quantityFormat.js";

export function extractWalmartPrice(tile) {
  const container = tile.querySelector('[data-automation-id="product-price"]');
  if (!container) return { priceText: null, priceNumber: null };

  // First try the split markup Walmart often uses where the integer and decimal
  // portions are separated into their own elements. This avoids accidentally
  // picking up additional numbers that may appear in the same container.
  const charEl = container.querySelector('[data-automation-id="price-characteristic"], .price-characteristic');
  const mantEl = container.querySelector('[data-automation-id="price-mantissa"], .price-mantissa');
  if (charEl && mantEl) {
    const whole = charEl.textContent.replace(/[^0-9]/g, '').trim();
    const frac = mantEl.textContent.replace(/[^0-9]/g, '').trim();
    if (whole && frac) {
      const num = parseFloat(`${whole}.${frac}`);
      if (!isNaN(num)) {
        return { priceText: `$${num.toFixed(2)}`, priceNumber: num };
      }
    }
  }

  // Fall back to parsing the raw text of the container. Walmart sometimes
  // embeds the decimal digits in separate elements, producing text like
  // "$234 current price $2.34". Parse the first decimal-looking value so we
  // don't misinterpret the price as 234.
  const raw = container.textContent.replace(/\s+/g, ' ').trim();
  const num = parsePriceNumber(raw);
  const priceNumber = isNaN(num) ? null : num;
  const priceText = priceNumber != null ? `$${priceNumber.toFixed(2)}` : raw;

  return { priceText, priceNumber };
}

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
  const tiles = document.querySelectorAll('[data-item-id], [data-testid="list-view"]');
  tiles.forEach(tile => {
    const name = tile.querySelector('[data-automation-id="product-title"]')?.textContent?.trim();

    const { priceText, priceNumber: extractedNumber } = extractWalmartPrice(tile);

    let unitSize = null;
    const sizeMatch = name?.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
    if (sizeMatch) {
      unitSize = `${sizeMatch[1]} ${sizeMatch[2]}`;
    }

    const perUnitText =
      tile.querySelector('[data-testid="product-price-per-unit"]')?.textContent?.trim() ||
      tile.querySelector('.gray')?.textContent?.trim();

    const image = getImageSrc(tile.querySelector('img[data-testid="productTileImage"]'));
    const link = tile.querySelector('a[href*="/ip/"]')?.href || '';

    const packCount = getPackCount(name, unitSize, perUnitText);

    let unitQty = null;
    let unitType = null;
    let pricePerUnit = null;
    if (perUnitText) {
      const parsed = parseUnitPrice(perUnitText);
      if (parsed) {
        pricePerUnit = parsed.pricePerUnit;
        unitType = parsed.unitType;
        unitQty = parsed.unitQty;
        const factor = UNIT_FACTORS[unitType];
        if (factor && !COUNT_UNITS.has(unitType)) {
          pricePerUnit = pricePerUnit / factor;
          unitType = 'oz';
        }
      }
    }

    let priceNumber = extractedNumber;

    let sizeQty = null;
    let sizeUnit = null;
    if (unitSize) {
      const m = unitSize.match(/([\d.]+)\s*(fl\.?\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
      if (m) {
        sizeQty = parseFloat(m[1]);
        sizeUnit = m[2].toLowerCase().replace(/[\s.]+/g, '');
        if (sizeUnit === 'floz') sizeUnit = 'oz';
      }
    }

    let totalSizeQty = null;
    if (sizeQty != null && sizeUnit) {
      const normalizedUnit = sizeUnit.toLowerCase();
      const shouldMultiply =
        COUNT_UNITS.has(normalizedUnit) &&
        packCount > 1 &&
        Math.abs(sizeQty - packCount) > 0.0001;
      totalSizeQty = shouldMultiply ? sizeQty * packCount : sizeQty;
      sizeUnit = normalizedUnit;
    } else if (unitQty != null && unitType) {
      const normalizedUnit = unitType.toLowerCase();
      const shouldMultiply =
        COUNT_UNITS.has(normalizedUnit) &&
        packCount > 1 &&
        Math.abs(unitQty - packCount) > 0.0001;
      totalSizeQty = shouldMultiply ? unitQty * packCount : unitQty;
      sizeUnit = normalizedUnit;
    }
    sizeQty = totalSizeQty;

    let convertedQty = null;

    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        if (!COUNT_UNITS.has(sizeUnit.toLowerCase())) {
          convertedQty = sizeQty * factor;
          unitType = 'oz';
          if (priceNumber != null && pricePerUnit == null) {
            pricePerUnit = priceNumber / convertedQty;
          }
        } else {
          convertedQty = sizeQty;
          if (!unitType) unitType = sizeUnit.toLowerCase();
          if (priceNumber != null && pricePerUnit == null) {
            pricePerUnit = priceNumber / convertedQty;
          }
        }
      }
    }

    if (name && priceText) {
      const sizeStr = sizeQty != null && sizeUnit ? `${sizeQty} ${sizeUnit}` : unitSize || '';
      products.push({
        name,
        price: priceText,
        priceNumber,
        size: sizeStr,
        sizeQty: sizeQty != null ? roundQuantity(sizeQty) : sizeQty,
        sizeUnit,
        unit: perUnitText || '',
        unitQty: unitQty != null ? roundQuantity(unitQty) : unitQty,
        unitType,
        convertedQty: convertedQty != null ? roundQuantity(convertedQty) : convertedQty,
        pricePerUnit: pricePerUnit != null ? roundQuantity(pricePerUnit) : pricePerUnit,
        packCount,
        image,
        link
      });
    }
  });
  return products;
}

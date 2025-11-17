import { getImageSrc } from "../utils/imageUtils.js";
import { parsePriceNumber } from "../utils/priceUtils.js";
import { roundQuantity } from "../utils/quantityFormat.js";
import {
  getStopAndShopProductName,
  getStopAndShopPriceText,
  sanitizeStopAndShopText
} from "../utils/stopAndShopProductName.js";
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

  const sanitize = sanitizeStopAndShopText;

  const UNIT_PHRASE_REPLACEMENTS = {
    'dry pint': 'pt',
    'dry pints': 'pt',
    'fluid ounce': 'fl oz',
    'fluid ounces': 'fl oz',
    'fluid oz': 'fl oz',
    'fluid ozs': 'fl oz',
    'dry quart': 'qt',
    'dry quarts': 'qt'
  };

  function normalizeUnitPhrases(str) {
    if (!str) return str;
    let normalized = str;
    Object.entries(UNIT_PHRASE_REPLACEMENTS).forEach(([phrase, replacement]) => {
      const pattern = phrase
        .split(' ')
        .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
      normalized = normalized.replace(new RegExp(`\\b${pattern}\\b`, 'gi'), replacement);
    });
    return normalized;
  }

  const WEIGHT_UNIT_PATTERN = 'fl\\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp';
  const UNIT_PATTERN = `${WEIGHT_UNIT_PATTERN}|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit`;

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
  const tiles = document.querySelectorAll('li.tile.product-cell.product-grid-cell');
  tiles.forEach(tile => {
    const name = getStopAndShopProductName(tile);

    const priceText = getStopAndShopPriceText(tile);

    const unitSize = tile.querySelector('.product-grid-cell_size')?.textContent?.trim();

    const perUnitText = tile.querySelector('.product-grid-cell_unit')?.textContent?.trim();

    const image = getImageSrc(tile.querySelector('img'));
    const link = tile.querySelector('a[href*="/product/"]')?.href || '';

    const packCount = getPackCount(name, unitSize, perUnitText);

    let unitQty = null;
    let unitType = null;
    const normalizedPerUnitText = normalizeUnitPhrases(perUnitText);

    if (normalizedPerUnitText) {
      const clean = normalizedPerUnitText.replace(/[^0-9./a-zA-Z]/g, '');
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
    const normalizedUnitSize = normalizeUnitPhrases(unitSize);

    if (normalizedUnitSize) {
      let m = normalizedUnitSize.match(new RegExp(`([\\d.]+)\\s*(${WEIGHT_UNIT_PATTERN})`, 'i'));
      if (!m) {
        m = normalizedUnitSize.match(new RegExp(`([\\d.]+)\\s*(${UNIT_PATTERN})`, 'i'));
      }
      if (m) {
        sizeQty = parseFloat(m[1]);
        sizeUnit = m[2].toLowerCase().replace(/\s+/g, '');
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
    let pricePerUnit = null;

    if (normalizedPerUnitText) {
      let m = normalizedPerUnitText.match(
        /\$([\d.]+)\s*\/?\s*([\d.]*)\s*([a-zA-Z][a-zA-Z.]*?(?:\s*[a-zA-Z.]+)*)/
      );
      let priceVal = null;
      let qtyVal = null;
      if (m) {
        priceVal = parseFloat(m[1]);
        qtyVal = parseFloat(m[2]);
        unitType = m[3].toLowerCase().replace(/[\s.]+/g, '');
      } else {
        m = normalizedPerUnitText.match(
          /([\d.]+)\s*¢\s*\/?\s*([\d.]*)\s*([a-zA-Z][a-zA-Z.]*?(?:\s*[a-zA-Z.]+)*)/
        );
        if (m) {
          priceVal = parseFloat(m[1]) / 100;
          qtyVal = parseFloat(m[2]);
          unitType = m[3].toLowerCase().replace(/[\s.]+/g, '');
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
      const roundedSizeQty = sizeQty != null ? roundQuantity(sizeQty) : sizeQty;
      const roundedUnitQty = unitQty != null ? roundQuantity(unitQty) : unitQty;
      const roundedConvertedQty = convertedQty != null ? roundQuantity(convertedQty) : convertedQty;
      const roundedPricePerUnit = pricePerUnit != null ? roundQuantity(pricePerUnit) : pricePerUnit;

      products.push({
        name,
        price: priceText,
        priceNumber,
        size: sizeStr,
        sizeQty: roundedSizeQty,
        sizeUnit,
        unit: perUnitText || '',
        unitQty: roundedUnitQty,
        unitType,
        convertedQty: roundedConvertedQty,
        pricePerUnit: roundedPricePerUnit,
        packCount,
        image,
        link
      });
    }
  });
  return products;
}

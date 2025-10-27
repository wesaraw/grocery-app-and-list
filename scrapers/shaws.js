import { getImageSrc } from "../utils/imageUtils.js";
import { parsePriceNumber, parseUnitPrice, UNIT_ALIASES } from "../utils/priceUtils.js";
import { roundQuantity } from "../utils/quantityFormat.js";
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

  function extractSize(text) {
    if (!text) return [null, null];
    let normalized = text.toLowerCase();
    for (const [word, abbr] of Object.entries(UNIT_ALIASES)) {
      const r = new RegExp(`\\b${word}\\b`, 'g');
      normalized = normalized.replace(r, abbr);
    }
    const hyphenMatch = normalized.match(/\b\d+\s*-\s*([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp)/i);
    if (hyphenMatch) {
      let unit = hyphenMatch[2].toLowerCase().replace(/\s+/g, '');
      if (unit === 'floz') unit = 'oz';
      unit = UNIT_ALIASES[unit] || unit;
      const qty = parseFloat(hyphenMatch[1]);
      return [qty, unit];
    }
    const regex = /([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|count|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/gi;
    let weightPair = null;
    let countPair = null;
    for (const m of normalized.matchAll(regex)) {
      let unit = m[2].toLowerCase().replace(/\s+/g, '');
      if (unit === 'floz') unit = 'oz';
      else if (unit === 'count') unit = 'ct';
      unit = UNIT_ALIASES[unit] || unit;
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
    const name = titleEl?.textContent?.trim();
    const sizeText = tile.querySelector('[data-qa="prd-itm-sqty"]')?.textContent?.trim();
    const unitText = (
      tile.querySelector('[data-qa="prd-itm-upr"]')?.textContent ||
      tile.querySelector('[data-qa="prd-itm-pprc-qty"]')?.textContent ||
      ''
    ).trim();
    const packCount = getPackCount(name, sizeText, unitText);
    const linkRel = titleEl?.getAttribute('href');
    const link = linkRel ? new URL(linkRel, 'https://www.shaws.com').href : '';
    const priceText = tile.querySelector('[data-qa="prd-itm-prc"]')?.textContent?.trim();
    const image = getImageSrc(tile.querySelector('img[data-qa="prd-itm-img"]'));

    let priceNumber = null;
    if (priceText) {
      const p = parsePriceNumber(priceText);
      if (!isNaN(p)) priceNumber = p;
    }

    let sizeQty = null;
    let sizeUnit = null;

    const [qtyFromText, unitFromText] = extractSize(sizeText);
    const [qtyFromName, unitFromName] = extractSize(name);

    const isWeightText = unitFromText && WEIGHT_UNITS.has(unitFromText.toLowerCase());
    const isWeightName = unitFromName && WEIGHT_UNITS.has(unitFromName.toLowerCase());

    if (isWeightText && isWeightName) {
      const ozText = qtyFromText * (UNIT_FACTORS[unitFromText.toLowerCase()] || 1);
      const ozName = qtyFromName * (UNIT_FACTORS[unitFromName.toLowerCase()] || 1);
      if (ozName > ozText) {
        sizeQty = qtyFromName;
        sizeUnit = unitFromName;
      } else {
        sizeQty = qtyFromText;
        sizeUnit = unitFromText;
      }
    } else if (isWeightText || isWeightName) {
      if (isWeightText) {
        sizeQty = qtyFromText;
        sizeUnit = unitFromText;
      } else {
        sizeQty = qtyFromName;
        sizeUnit = unitFromName;
      }
    } else {
      if (qtyFromText != null) {
        sizeQty = qtyFromText;
        sizeUnit = unitFromText;
      } else {
        sizeQty = qtyFromName;
        sizeUnit = unitFromName;
      }
    }

  if (sizeUnit) {
    const key = sizeUnit.toLowerCase();
    sizeUnit = UNIT_ALIASES[key] || key;
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
    const parsedInfo = parseUnitPrice(unitText);
    let pricePerUnit = parsedInfo ? parsedInfo.pricePerUnit : null;
    let unitQty = parsedInfo ? parsedInfo.unitQty : null;
    let unitType = parsedInfo ? parsedInfo.unitType : null;
    if (unitType) {
      unitType = UNIT_ALIASES[unitType] || unitType;
      if (pricePerUnit != null && WEIGHT_UNITS.has(unitType) && UNIT_FACTORS[unitType]) {
        pricePerUnit = pricePerUnit / UNIT_FACTORS[unitType];
        unitType = 'oz';
      }
    }

    if (sizeQty != null && sizeUnit) {
      const unit = sizeUnit.toLowerCase();
      const factor = UNIT_FACTORS[unit];
      if (factor) {
        if (!COUNT_UNITS.has(unit)) {
          convertedQty = sizeQty * factor;
          unitType = 'oz';
        } else {
          convertedQty = sizeQty;
          if (!unitType) unitType = unit;
        }
        if (priceNumber != null && pricePerUnit == null) {
          pricePerUnit = priceNumber / convertedQty;
        }
      }
    }

    if (name && priceText) {
      const sizeStr = sizeQty != null && sizeUnit ? `${sizeQty} ${sizeUnit}` : sizeText || '';
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
        unit: unitText || '',
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

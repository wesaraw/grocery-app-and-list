import { getImageSrc } from "../utils/imageUtils.js";
import { parsePriceNumber, parseUnitPrice } from "../utils/priceUtils.js";
import { roundQuantity } from "../utils/quantityFormat.js";
export function scrapeHannaford() {
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

  const WEIGHT_UNITS = new Set(['oz', 'lb', 'g', 'kg']);
  const VOLUME_UNITS = new Set([
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

  const UNIT_ALIASES = {
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
    pound: 'lb',
    pounds: 'lb',
    perlb: 'lb',
    perpound: 'lb',
    ounce: 'oz',
    ounces: 'oz',
    peroz: 'oz',
    perounce: 'oz'
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
  const tiles = document.querySelectorAll('div.catalog-product');
  tiles.forEach(tile => {
    const linkRel = tile.getAttribute('href') || tile.getAttribute('data-url');
    const link = linkRel
      ? new URL(linkRel, 'https://www.hannaford.com').href
      : '';
    const name = tile.querySelector('.productName .real-product-name')?.textContent?.trim();
    const sizeText = tile.querySelector('.overline.text-truncate')?.textContent?.trim();
    const perUnitText = tile.querySelector('.unitPriceDisplay')?.textContent?.trim();
    const packCount = getPackCount(name, sizeText, perUnitText);
    const priceText = tile.querySelector('.priceCell .item-unit-price')?.textContent?.trim();
    const image = getImageSrc(tile.querySelector('img'));

    let priceNumber = null;
    if (priceText) {
      const p = parsePriceNumber(priceText);
      if (!isNaN(p)) priceNumber = p;
    }

    let unitQty = null;
    let unitType = null;
    let pricePerUnit = null;

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      let normalized = sizeText.toLowerCase();
      normalized = normalized.replace(/-/g, ' ');
      for (const [word, abbr] of Object.entries(UNIT_ALIASES)) {
        const r = new RegExp(`\\b${word}\\b`, 'g');
        normalized = normalized.replace(r, abbr);
      }
      const m = normalized.match(/([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
      if (m) {
        sizeQty = parseFloat(m[1]);
        sizeUnit = m[2].toLowerCase().replace(/\s+/g, '');
        if (sizeUnit === 'floz') sizeUnit = 'oz';
      }
    }

    let totalSizeQty = null;
    if (sizeQty != null) {
      totalSizeQty = sizeQty * packCount;
    } else if (unitQty != null && unitType) {
      totalSizeQty = unitQty * packCount;
      sizeUnit = unitType;
    }
    sizeQty = totalSizeQty;

    let convertedQty = null;

    if (perUnitText) {
      const parsed = parseUnitPrice(perUnitText);
      if (parsed) {
        pricePerUnit = parsed.pricePerUnit;
        unitType = parsed.unitType;
        unitQty = parsed.unitQty;
        const factor = UNIT_FACTORS[unitType];
        if (factor && !COUNT_UNITS.has(unitType)) {
          pricePerUnit = pricePerUnit / factor;
          unitType = VOLUME_UNITS.has(unitType) ? 'fl oz' : 'oz';
        }
      }
    }

    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        if (!COUNT_UNITS.has(sizeUnit.toLowerCase())) {
          convertedQty = sizeQty * factor;
          unitType = VOLUME_UNITS.has(sizeUnit.toLowerCase()) ? 'fl oz' : 'oz';
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

    const roundedPricePerUnit = pricePerUnit != null ? roundQuantity(pricePerUnit) : pricePerUnit;
    const roundedSizeQty = sizeQty != null ? roundQuantity(sizeQty) : sizeQty;
    const roundedUnitQty = unitQty != null ? roundQuantity(unitQty) : unitQty;
    const roundedConvertedQty = convertedQty != null ? roundQuantity(convertedQty) : convertedQty;

    const normalizedUnit =
      roundedPricePerUnit != null && unitType
        ? `$${roundedPricePerUnit.toFixed(2)}/${unitType}`
        : perUnitText || '';

    if (name && (priceText || priceNumber != null)) {
      const sizeStr = sizeQty != null && sizeUnit ? `${sizeQty} ${sizeUnit}` : sizeText || '';
      products.push({
        name,
        price: priceText || (priceNumber != null ? `$${priceNumber.toFixed(2)}` : ''),
        priceNumber,
        size: sizeStr,
        sizeQty: roundedSizeQty,
        sizeUnit,
        unit: normalizedUnit,
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

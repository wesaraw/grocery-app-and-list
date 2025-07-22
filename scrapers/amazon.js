import { getImageSrc } from "../utils/imageUtils.js";
import { parsePriceNumber, parseUnitPrice } from "../utils/priceUtils.js";
export function scrapeAmazon() {
  const UNIT_FACTORS = {
    oz: 1,
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
    'lb',
    'g',
    'kg',
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


  function parseUnitInfo(name, unitText, sizeText) {
    // Prefer the size text and name over the unit text when extracting
    // quantity and unit since the unit text may include pricing info.
    const fields = [sizeText, name, unitText];
    let unitSize = null;
    let unit = null;
    for (const field of fields) {
      if (!field) continue;
      // Skip strings that contain a price which can confuse the regex
      if (field.includes('$') || field.includes('¢')) continue;
      const m = field.match(/([\d.]+)[\s-]*(oz|ounce|fluid ounce|fl oz|g|gram|kg|ml|l|gal|gallon|gallons|lb|lbs?|pound|pounds)\b/i);
      if (m) {
        unitSize = parseFloat(m[1]);
        unit = m[2].toLowerCase();
        break;
      }
    }
    if (unit) {
      unit = unit.replace(/\s+/g, '');
      if (unit === 'ounce' || unit === 'ounces' || unit === 'floz' || unit === 'fluidounce' || unit === 'flounce') unit = 'oz';
      else if (unit === 'gram') unit = 'g';
      else if (unit === 'gallon' || unit === 'gallons') unit = 'gal';
      else if (unit === 'lbs' || unit === 'pound' || unit === 'pounds') unit = 'lb';
    }

    const packFields = [name, unitText, sizeText];
    let packCount = 1;
    for (const field of packFields) {
      if (!field) continue;
      let m = field.match(/pack\s*of\s*(\d+)/i);
      if (!m) m = field.match(/(\d+)\s*[xX]/);
      if (!m) m = field.match(/(\d+)\s*(?:pack|pk|ct|count)/i);
      if (m) {
        packCount = parseInt(m[1], 10);
        break;
      }
    }
    return { unitSize, unit, packCount };
  }

  const products = [];
  const tiles = document.querySelectorAll(
    'div[data-asin][data-component-type="s-search-result"]'
  );
  tiles.forEach(tile => {
    const link = tile.querySelector('a.a-link-normal.s-no-outline')?.href || '';
    const name = tile.querySelector('h2.a-size-base-plus span')?.textContent?.trim();
    const image = getImageSrc(tile.querySelector('img.s-image'));
    const priceText = tile
      .querySelector('span.a-price span.a-offscreen')?.textContent?.trim();
    const unitText = tile
      .querySelector('span.a-size-base.a-color-secondary')
      ?.textContent?.trim();
    const countText = tile
      .querySelector('span.a-size-base.a-color-base')
      ?.textContent?.trim();

    const unitInfo = parseUnitInfo(name, unitText, countText);
    const packCount = unitInfo.packCount;

    let priceNumber = null;
    if (priceText) {
      const p = parsePriceNumber(priceText);
      if (!isNaN(p)) priceNumber = p;
    }

    let unitQty = null;
    let unitType = null;
    let pricePerUnit = null;
    if (unitText) {
      const parsed = parseUnitPrice(unitText);
      if (parsed) {
        pricePerUnit = parsed.pricePerUnit;
        unitType = parsed.unitType;
        unitQty = parsed.unitQty;
        const factor = UNIT_FACTORS[unitType];
        if (factor && WEIGHT_UNITS.has(unitType)) {
          pricePerUnit = pricePerUnit / factor;
          unitType = 'oz';
        }
      }
    }

    if ((unitType === 'count' || unitType === 'ct') && priceNumber != null) {
      if (pricePerUnit == null) {
        pricePerUnit = priceNumber / packCount;
      }
    } else if (!unitText && priceNumber != null && packCount) {
      pricePerUnit = priceNumber / packCount;
      unitType = 'count';
    }

    if (pricePerUnit == null && priceNumber != null && packCount > 1) {
      pricePerUnit = priceNumber / packCount;
      unitType = 'count';
    }

    const baseSizeQty = unitInfo.unitSize;
    let sizeQty = baseSizeQty != null ? baseSizeQty * packCount : null;
    let sizeUnit = unitInfo.unit;
    if (sizeQty == null && unitQty != null && unitType) {
      sizeQty = unitQty * packCount;
      sizeUnit = unitType;
    }

    let convertedQty = null;
    if (sizeQty != null && sizeUnit && UNIT_FACTORS[sizeUnit]) {
      convertedQty = sizeQty * UNIT_FACTORS[sizeUnit];
      if (WEIGHT_UNITS.has(sizeUnit)) {
        unitType = 'oz';
      } else if (!unitType) {
        unitType = sizeUnit;
      }
      if (priceNumber != null && pricePerUnit == null && unitType !== 'count' && unitType !== 'ct') {
        pricePerUnit = priceNumber / convertedQty;
      }
    }

    if (name && priceText) {
      const sizeStr = sizeQty != null && sizeUnit ? `${sizeQty} ${sizeUnit}` : countText || '';
      products.push({
        name,
        price: priceText,
        priceNumber,
        size: sizeStr,
        sizeQty,
        sizeUnit,
        unit: unitText || '',
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

  products.sort((a, b) => {
    const aPrice = a.pricePerUnit ?? Infinity;
    const bPrice = b.pricePerUnit ?? Infinity;
    return aPrice - bPrice;
  });

  return products;
}

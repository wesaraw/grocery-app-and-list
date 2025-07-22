import { getImageSrc } from "../imageUtils.js";
import { parsePriceNumber, parseUnitPrice } from "../priceUtils.js";
import { UNIT_FACTORS, COUNT_UNITS, getPackCount } from "./common.js";

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
    if (sizeQty != null) {
      totalSizeQty = sizeQty * packCount;
    } else if (unitQty != null && unitType) {
      totalSizeQty = unitQty * packCount;
      sizeUnit = unitType;
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

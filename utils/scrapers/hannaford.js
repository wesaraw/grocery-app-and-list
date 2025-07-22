import { getImageSrc } from "../imageUtils.js";
import { parsePriceNumber, parseUnitPrice, UNIT_ALIASES } from "../priceUtils.js";
import {
  UNIT_FACTORS,
  WEIGHT_UNITS,
  VOLUME_UNITS,
  COUNT_UNITS,
  getPackCount
} from "./common.js";
export function scrapeHannaford() {

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

    const normalizedUnit =
      pricePerUnit != null && unitType
        ? `$${pricePerUnit.toFixed(2)}/${unitType}`
        : perUnitText || '';

    if (name && (priceText || priceNumber != null)) {
      const sizeStr = sizeQty != null && sizeUnit ? `${sizeQty} ${sizeUnit}` : sizeText || '';
      products.push({
        name,
        price: priceText || (priceNumber != null ? `$${priceNumber.toFixed(2)}` : ''),
        priceNumber,
        size: sizeStr,
        sizeQty,
        sizeUnit,
        unit: normalizedUnit,
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

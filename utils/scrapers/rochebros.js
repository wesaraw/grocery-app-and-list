import { getImageSrc } from "../imageUtils.js";
import { parsePriceNumber, parseUnitPrice } from "../priceUtils.js";
import { UNIT_FACTORS, COUNT_UNITS, getPackCount } from "./common.js";
export function scrapeRocheBros() {

  const products = [];
  const tiles = document.querySelectorAll(
    '[data-test-id="product-card"], [data-test="product-cell"]'
  );
  tiles.forEach(tile => {
    const name =
      tile.querySelector('.c-card__content__title')?.textContent?.trim() ||
      tile.querySelector('.cell-title-text')?.textContent?.trim();
    const sizeText =
      tile.querySelector('.package-info__package-size')?.textContent?.trim() ||
      tile.querySelector('.cell-product-size')?.textContent?.trim();
    let unitText =
      tile.querySelector('.package-info__price-per-uom')?.textContent?.trim() ||
      tile.querySelector('[data-test="per-unit-price"]')?.textContent?.trim();
    const packCount = getPackCount(name, sizeText, unitText);
    const link =
      tile.querySelector('a.c-card__link[href]')?.href ||
      tile.querySelector('a[href]')?.href ||
      '';
    const addBtn =
      tile.querySelector('button[data-test-id="add-to-cart-action"]') ||
      tile.querySelector('button[data-test="add-to-cart-button"]') ||
      tile.querySelector('button[data-test-id^="add-to-cart-button"]');
    const addToCartId = addBtn?.id || addBtn?.getAttribute('data-test-id') || '';
    let priceText =
      tile.querySelector('.price-label__row-two.price-label__price')?.textContent ||
      tile.querySelector('[data-test="amount"] span')?.textContent ||
      '';
    priceText = priceText
      .replace(/for/, ' for ')
      .replace(/\/(\$)/, ' $1')
      .replace(/\s+/g, ' ')
      .trim();
    const imageEl =
      tile.querySelector('img.c-image') ||
      tile.querySelector('.cell-image');
    const image = getImageSrc(imageEl);

    let priceNumber = null;
    if (priceText) {
      const p = parsePriceNumber(priceText);
      if (!isNaN(p)) priceNumber = p;
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      const m = sizeText.match(/([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
      if (m) {
        sizeQty = parseFloat(m[1]);
        sizeUnit = m[2].toLowerCase().replace(/\s+/g, '');
        if (sizeUnit === 'floz') sizeUnit = 'oz';
      }
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
        if (unitType === 'gl') unitType = 'gal';
        const factor = UNIT_FACTORS[unitType];
        if (factor && !COUNT_UNITS.has(unitType)) {
          pricePerUnit = pricePerUnit / factor;
          unitType = 'oz';
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
        link,
        addToCartId
      });
    }
  });
  return products;
}

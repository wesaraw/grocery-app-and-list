import { getImageSrc } from "../imageUtils.js";
import { parsePriceNumber } from "../priceUtils.js";
import {
  UNIT_FACTORS,
  COUNT_UNITS,
  getPackCount
} from "./common.js";
export function scrapeStopAndShop() {

  const products = [];
  const tiles = document.querySelectorAll('li.tile.product-cell.product-grid-cell');
  tiles.forEach(tile => {
    const name = tile.querySelector('.product-grid-cell_price-container > .sr-only')?.textContent?.trim();

    const priceText = tile.querySelector('.product-grid-cell_main-price')?.textContent?.trim();

    const unitSize = tile.querySelector('.product-grid-cell_size')?.textContent?.trim();

    const perUnitText = tile.querySelector('.product-grid-cell_unit')?.textContent?.trim();

    const image = getImageSrc(tile.querySelector('img'));
    const link = tile.querySelector('a[href*="/product/"]')?.href || '';

    const packCount = getPackCount(name, unitSize, perUnitText);

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

    let totalSizeQty = null;
    if (sizeQty != null) {
      totalSizeQty = sizeQty * packCount;
    } else if (unitQty != null && unitType) {
      totalSizeQty = unitQty * packCount;
      sizeUnit = unitType;
    }
    sizeQty = totalSizeQty;

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

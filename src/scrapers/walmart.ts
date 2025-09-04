import {
  UNIT_FACTORS,
  COUNT_UNITS,
  getPackCount,
  parseUnitPrice,
  selectOne,
  getStoreStrategy,
  sanitizeText,
} from './common';
import './config';

/**
 * Scrape Walmart search result tiles using shared helpers.
 *
 * Follows patterns documented in "Scraper Profiling.txt" under the Walmart section
 * and reuses logic from Version Old/scrapers/walmart.js.
 */
export function scrapeWalmart(root: Document = document) {
  const strategy = getStoreStrategy('walmart');
  const sel = strategy.selectors || {};
  const tileSelectors = sel.tile || ['[data-item-id]', '[data-testid="list-view"]'];
  const tiles = Array.from(root.querySelectorAll(tileSelectors.join(',')));

  const products: any[] = [];

  tiles.forEach(tile => {
    const name = sanitizeText(
      selectOne(tile, sel.name || [])?.textContent || null,
    ) || null;

    const priceInfo =
      (strategy.data?.priceExtractor as ((el: Element) => { priceText: string | null; priceNumber: number | null }) | undefined)?.(tile) ||
      { priceText: null, priceNumber: null };
    const { priceText, priceNumber: extractedNumber } = priceInfo;

    let unitSize: string | null = null;
    const sizeMatch = name?.match(
      /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i,
    );
    if (sizeMatch) {
      unitSize = `${sizeMatch[1]} ${sizeMatch[2]}`;
    }

    const perUnitText = sanitizeText(
      selectOne(tile, sel.perUnit || [])?.textContent || null,
    ) || null;
    const image = (selectOne(tile, sel.image || []) as HTMLImageElement | null)?.src || '';
    const link = (selectOne(tile, sel.link || []) as HTMLAnchorElement | null)?.href || '';

    const packCount = getPackCount(name, unitSize, perUnitText);

    let unitQty: number | null = null;
    let unitType: string | null = null;
    let pricePerUnit: number | null = null;
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

    let sizeQty: number | null = null;
    let sizeUnit: string | null = null;
    if (unitSize) {
      const m = unitSize.match(
        /([\d.]+)\s*(fl\.?\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i,
      );
      if (m) {
        sizeQty = parseFloat(m[1]);
        sizeUnit = m[2].toLowerCase().replace(/[\s.]+/g, '');
        if (sizeUnit === 'floz') sizeUnit = 'oz';
      }
    }

    let totalSizeQty: number | null = null;
    if (sizeQty != null) {
      totalSizeQty = sizeQty * packCount;
    } else if (unitQty != null && unitType) {
      totalSizeQty = unitQty * packCount;
      sizeUnit = unitType;
    }
    sizeQty = totalSizeQty;

    let convertedQty: number | null = null;
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit];
      if (factor && !COUNT_UNITS.has(sizeUnit)) {
        convertedQty = sizeQty * factor;
        sizeUnit = 'oz';
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
        link,
      });
    }
  });

  return products;
}

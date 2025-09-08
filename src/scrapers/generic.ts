import {
  UNIT_FACTORS,
  COUNT_UNITS,
  getPackCount,
  parseUnitPrice,
  parsePriceNumber,
  selectOne,
  getStoreStrategy,
  sanitizeText,
} from './common.ts';

/**
 * Generic scraper that reads selector configuration from {@link storeStrategies}.
 * Each store registers its selectors in {@link config.ts}.  This function
 * then applies a consistent parsing flow across stores.
 */
export function scrapeWithStrategy(storeId: string, root: Document = document) {
  const strategy = getStoreStrategy(storeId);
  const sel = strategy.selectors || {};
  const tileSel = sel.tile || [];
  const tiles = tileSel.length ? Array.from(root.querySelectorAll(tileSel.join(','))) : [];
  const products: any[] = [];

  tiles.forEach(tile => {
    const name =
      sanitizeText(selectOne(tile, sel.name || [])?.textContent || null) || null;
    const priceNode = selectOne(tile, sel.price || []);
    let priceText = sanitizeText(priceNode?.textContent || null) || null;
    let priceNumber: number | null = null;
    if (typeof strategy.data?.priceExtractor === 'function') {
      const info = (strategy.data.priceExtractor as (el: Element) => {
        priceText: string | null;
        priceNumber: number | null;
      })(tile);
      if (info.priceText) priceText = info.priceText;
      if (info.priceNumber != null) priceNumber = info.priceNumber;
    }
    if (priceNumber == null && priceText) {
      const num = parsePriceNumber(priceText);
      priceNumber = num != null ? num : null;
    }

    const sizeText =
      sanitizeText(selectOne(tile, sel.size || [])?.textContent || null) || null;
    const perUnitText =
      sanitizeText(selectOne(tile, sel.perUnit || [])?.textContent || null) || null;
    const image =
      (selectOne(tile, sel.image || []) as HTMLImageElement | null)?.src || '';
    const link =
      (selectOne(tile, sel.link || []) as HTMLAnchorElement | null)?.href || '';

    const packCount = getPackCount(name, sizeText, perUnitText);

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

    let sizeQty: number | null = null;
    let sizeUnit: string | null = null;
    if (sizeText) {
      const m = sizeText.match(
        /(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i,
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
      } else {
        convertedQty = sizeQty;
      }
    }

    if (
      priceNumber != null &&
      pricePerUnit == null &&
      convertedQty != null &&
      unitType !== 'count' &&
      unitType !== 'ct'
    ) {
      pricePerUnit = priceNumber / convertedQty;
      unitType = unitType || sizeUnit;
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

export default scrapeWithStrategy;

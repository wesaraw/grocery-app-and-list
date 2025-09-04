import { registerStoreStrategy, StoreStrategy, selectOne, parsePriceNumber } from './common';

// Walmart strategy: selectors and price extraction quirks.
// Reference: Version Old/scrapers/walmart.js and "Scraper Profiling.txt"
// Walmart prices may split integer and mantissa into separate elements.
function extractWalmartPrice(tile: Element) {
  const container = tile.querySelector('[data-automation-id="product-price"]');
  if (!container) return { priceText: null, priceNumber: null };

  // Split markup: integer and decimal in distinct nodes.
  const charEl = selectOne(container, [
    '[data-automation-id="price-characteristic"]',
    '.price-characteristic',
  ]);
  const mantEl = selectOne(container, [
    '[data-automation-id="price-mantissa"]',
    '.price-mantissa',
  ]);
  if (charEl && mantEl) {
    const whole = charEl.textContent?.replace(/[^0-9]/g, '').trim();
    const frac = mantEl.textContent?.replace(/[^0-9]/g, '').trim();
    if (whole && frac) {
      const num = parseFloat(`${whole}.${frac}`);
      if (!isNaN(num)) {
        return { priceText: `$${num.toFixed(2)}`, priceNumber: num };
      }
    }
  }

  // Fallback: parse first decimal-looking value from raw text.
  const raw = container.textContent?.replace(/\s+/g, ' ').trim() || '';
  const num = parsePriceNumber(raw);
  const priceNumber = num != null && !isNaN(num) ? num : null;
  const priceText = priceNumber != null ? `$${priceNumber.toFixed(2)}` : raw;
  return { priceText, priceNumber };
}

const walmart: StoreStrategy = {
  selectors: {
    tile: ['[data-item-id]', '[data-testid="list-view"]'],
    name: ['[data-automation-id="product-title"]'],
    perUnit: ['[data-testid="product-price-per-unit"]', '.gray'],
    image: ['img[data-testid="productTileImage"]'],
    link: ['a[href*="/ip/"]'],
  },
  data: {
    priceExtractor: extractWalmartPrice,
  },
};

registerStoreStrategy('walmart', walmart);

export { walmart };

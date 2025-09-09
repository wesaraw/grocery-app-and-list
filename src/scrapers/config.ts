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

// Amazon selectors
const amazon: StoreStrategy = {
  selectors: {
    tile: ['div[data-asin][data-component-type="s-search-result"]'],
    name: ['h2 a span'],
    price: ['span.a-price span.a-offscreen'],
    perUnit: ['span.a-size-base.a-color-secondary'],
    size: ['span.a-size-base.a-color-base'],
    image: ['img.s-image'],
    link: ['a.a-link-normal.s-no-outline'],
  },
};
registerStoreStrategy('amazon', amazon);

// Hannaford selectors
const hannaford: StoreStrategy = {
  selectors: {
    tile: ['div.catalog-product'],
    name: ['.productName .real-product-name'],
    price: ['.priceCell .item-unit-price'],
    perUnit: ['.unitPriceDisplay'],
    size: ['.overline.text-truncate'],
    image: ['img'],
    link: ['a'],
  },
};
registerStoreStrategy('hannaford', hannaford);

// Roche Bros selectors
const rocheBros: StoreStrategy = {
  selectors: {
    tile: ['[data-test-id="product-card"]', '[data-test="product-cell"]'],
    name: ['[data-test-id="product-card-title"]', '[data-test="product-title"]'],
    price: ['[data-test-id="product-card-price"]', '[data-test="product-price"]'],
    perUnit: ['[data-test-id="product-card-unit-price"]', '[data-test="product-unit-price"]'],
    size: ['[data-test-id="product-card-size"]', '[data-test="product-size"]'],
    image: ['img'],
    link: ['a'],
  },
};
registerStoreStrategy('roche-bros', rocheBros);

// Shaw's selectors
const shaws: StoreStrategy = {
  selectors: {
    tile: ['.product-item-al-v2'],
    name: ['[data-qa="prd-itm-pttl"]'],
    price: ['[data-qa="prd-itm-prc"]'],
    perUnit: ['[data-qa="prd-itm-upr"]', '[data-qa="prd-itm-pprc-qty"]'],
    size: ['[data-qa="prd-itm-sqty"]'],
    image: ['img[data-qa="prd-itm-img"]', 'img'],
    link: ['a[data-qa="prd-itm-lk"]', 'a'],
  },
};
registerStoreStrategy('shaws', shaws);

// Stop & Shop selectors
const stopAndShop: StoreStrategy = {
  selectors: {
    tile: ['li.tile.product-cell.product-grid-cell'],
    name: ['.product-grid-cell_price-container .sr-only'],
    price: ['.product-grid-cell_price'],
    perUnit: ['.product-grid-cell_unit-price'],
    size: ['.product-grid-cell_size'],
    image: ['img'],
    link: ['a.product-grid-cell_link', 'a'],
  },
};
registerStoreStrategy('stop-and-shop', stopAndShop);

export { amazon, hannaford, rocheBros, shaws, stopAndShop };

export function sanitizeStopAndShopText(str) {
  if (str == null) return '';
  return String(str)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getStopAndShopProductName(tile) {
  if (!tile) return null;
  const selectors = [
    '.product-grid-cell_name-text',
    '.product-grid-cell_name',
    '.product-grid-cell_title',
    '.product-tile_detail-name',
    '.product-grid-cell_price-container > .sr-only'
  ];

  for (const selector of selectors) {
    const node = tile.querySelector(selector);
    if (!node) continue;
    const text = sanitizeStopAndShopText(node.textContent);
    if (text && !/^(sale|original) price$/i.test(text)) {
      return text;
    }
  }

  const linkWithLabel =
    tile.querySelector('a[data-opens-modal="true"][aria-label]') ||
    tile.querySelector('a[href*="/product/"][aria-label]');
  const ariaLabel = sanitizeStopAndShopText(linkWithLabel?.getAttribute('aria-label'));
  if (ariaLabel) {
    return ariaLabel;
  }

  const titleAttr = sanitizeStopAndShopText(
    tile.querySelector('a[href*="/product/"][title]')?.getAttribute('title')
  );
  if (titleAttr) {
    return titleAttr;
  }

  const imgAlt = sanitizeStopAndShopText(
    tile.querySelector('.product-grid-cell_main-image[alt], img[alt]')?.getAttribute('alt')
  );
  if (imgAlt) {
    return imgAlt;
  }

  return null;
}

const PRICE_TEXT_SELECTORS = [
  '.product-price__value',
  '.product-price__primary',
  '.product-price__price',
  '.product-grid-cell_main-price',
  '.product-grid-cell_regular-price',
  '.product-price',
  '.product-grid-cell_price',
  '.product-card__price',
  '[data-test="product-price"]',
  '[data-testid="product-price"]'
];

const PRICE_ATTR_TARGETS = [
  ['[data-price]', 'data-price'],
  ['[data-price-value]', 'data-price-value'],
  ['[data-product-price]', 'data-product-price'],
  ['[data-final-price]', 'data-final-price']
];

const PER_UNIT_PATTERN = /\/(?:ea|each|ct|count|pkg|pk|bag|box|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit|lb|oz|floz|g|kg|ml|l)/i;

function looksLikeMainPrice(text) {
  if (!text) return '';
  let sanitized = sanitizeStopAndShopText(text);
  if (!sanitized || !/[0-9]/.test(sanitized)) return '';
  sanitized = sanitized.replace(/^(?:sale|original) price\s*/i, '').trim();
  if (PER_UNIT_PATTERN.test(sanitized) || /\bper\b/i.test(sanitized)) return '';
  return sanitized;
}

export function getStopAndShopPriceText(tile) {
  if (!tile) return '';

  for (const selector of PRICE_TEXT_SELECTORS) {
    const text = looksLikeMainPrice(tile.querySelector(selector)?.textContent);
    if (text) {
      return text;
    }
  }

  for (const [selector, attr] of PRICE_ATTR_TARGETS) {
    const node = tile.querySelector(selector);
    if (!node) continue;
    const value = looksLikeMainPrice(node.getAttribute(attr));
    if (value) {
      return value.startsWith('$') ? value : `$${value}`;
    }
  }

  const priceContainers = tile.querySelectorAll(
    '.product-grid-cell_price-container, .product-price, [class*="price"], [data-test*="price"], [data-testid*="price"]'
  );
  for (const container of priceContainers) {
    const text = looksLikeMainPrice(container.textContent);
    if (text) {
      return text;
    }
  }

  return '';
}

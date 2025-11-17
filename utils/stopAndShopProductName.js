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

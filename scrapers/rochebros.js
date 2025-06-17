export function scrapeRocheBros() {
  const UNIT_FACTORS = {
    oz: 1,
    floz: 1,
    lb: 16,
    g: 0.035274,
    kg: 35.274,
    ml: 0.033814,
    l: 33.814,
    gal: 128,
    qt: 32,
    pt: 16,
    cup: 8,
    tbsp: 0.5,
    tsp: 0.1667,
    ea: 1,
    ct: 1,
    pkg: 1,
    box: 1,
    can: 1,
    bag: 1,
    bottle: 1,
    stick: 1,
    roll: 1,
    bar: 1,
    pouch: 1,
    jar: 1,
    packet: 1,
    sleeve: 1,
    slice: 1,
    piece: 1,
    tube: 1,
    tray: 1,
    unit: 1
  };

  const products = [];
  const tiles = document.querySelectorAll('[data-test="product-cell"]');
  tiles.forEach(tile => {
    const name = tile.querySelector('.cell-title-text')?.innerText?.trim();
    const link = tile.querySelector('a[href]')?.href || '';
    const addBtn = tile.querySelector('button[data-test="add-to-cart-button"]') ||
      tile.querySelector('button[data-test-id^="add-to-cart-button"]');
    const addToCartId = addBtn?.id || addBtn?.getAttribute('data-test-id') || '';
    const priceText = tile.querySelector('[data-test="amount"] span')?.innerText?.trim();
    const sizeText = tile.querySelector('.cell-product-size')?.innerText?.trim();
    const unitText = tile.querySelector('[data-test="per-unit-price"]')?.innerText?.trim();
    const imageEl = tile.querySelector('.cell-image');
    const image =
      imageEl?.getAttribute('data-src') ||
      imageEl?.src ||
      imageEl?.style.backgroundImage?.match(/url\("?(.*?)"?\)/)?.[1] ||
      '';

    let priceNumber = null;
    if (priceText) {
      const p = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      const m = sizeText.match(/([\d.]+)\s*(fl\s*oz|oz|lb|g|kg|ml|l|gal|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
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
      const m = unitText.match(/\$([\d.]+)\s*\/\s*(fl\s*oz|oz|lb|g|kg|ml|l|gal|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
      if (m) {
        pricePerUnit = parseFloat(m[1]);
        unitType = m[2].toLowerCase().replace(/\s+/g, '');
        const factor = UNIT_FACTORS[unitType];
        if (factor) {
          pricePerUnit = pricePerUnit / factor;
          unitType = 'oz';
        }
      }
    }

    let convertedQty = null;
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null && pricePerUnit == null) {
          pricePerUnit = priceNumber / convertedQty;
          unitType = 'oz';
        }
      }
    }

    if (name && priceText) {
      products.push({
        name,
        price: priceText,
        priceNumber,
        size: sizeText || '',
        sizeQty,
        sizeUnit,
        unit: unitText || '',
        unitQty,
        unitType,
        convertedQty,
        pricePerUnit,
        image,
        link,
        addToCartId
      });
    }
  });
  return products;
}

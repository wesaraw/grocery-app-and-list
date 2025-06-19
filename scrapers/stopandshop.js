export function scrapeStopAndShop() {
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
  const tiles = document.querySelectorAll('li.tile.product-cell.product-grid-cell');
  tiles.forEach(tile => {
    const name = tile.querySelector('.product-grid-cell_price-container > .sr-only')?.innerText?.trim();

    const priceText = tile.querySelector('.product-grid-cell_main-price')?.innerText?.trim();

    const unitSize = tile.querySelector('.product-grid-cell_size')?.innerText?.trim();

    const perUnitText = tile.querySelector('.product-grid-cell_unit')?.innerText?.trim();

    const image = tile.querySelector('img')?.src || '';
    const link = tile.querySelector('a[href*="/product/"]')?.href || '';

    const packMatch = name?.match(/(?:pack\s*of\s*)?(\d+)\s*(?:pk|pack|ct|count)/i) || name?.match(/(\d+)\s*[xX]/);
    const packCount = packMatch ? parseInt(packMatch[1], 10) : 1;

    let unitQty = null;
    let unitType = null;
    if (perUnitText) {
      const clean = perUnitText.replace(/[^0-9./a-zA-Z]/g, '');
      const match = clean.match(/([\d.]+)\/(fl\s*oz|oz|lb|g|kg|ml|l|gal|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
      if (match) {
        unitQty = parseFloat(match[1]);
        unitType = match[2].toLowerCase().replace(/\s+/g, '');
        if (unitType === 'floz') unitType = 'oz';
      }
    }

    let priceNumber = null;
    if (priceText) {
      const p = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (unitSize) {
      const m = unitSize.match(/([\d.]+)\s*(fl\s*oz|oz|lb|g|kg|ml|l|gal|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
      if (m) {
        sizeQty = parseFloat(m[1]);
        sizeUnit = m[2].toLowerCase().replace(/\s+/g, '');
        if (sizeUnit === 'floz') sizeUnit = 'oz';
      }
    }

    let convertedQty = null;
    let pricePerUnit = null;

    if (perUnitText) {
      const m = perUnitText.match(/\$([\d.]+)\/?\s*([\d.]*)\s*(\w+)/);
      if (m) {
        let priceVal = parseFloat(m[1]);
        const qtyVal = parseFloat(m[2]);
        const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        pricePerUnit = priceVal / qty;
        unitType = m[3].toLowerCase().replace(/\s+/g, '');
        if (unitType === 'floz') unitType = 'oz';
        const factor = UNIT_FACTORS[unitType];
        if (factor) {
          pricePerUnit = pricePerUnit / factor;
          unitType = 'oz';
        }
      }
    }

    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null && pricePerUnit == null) {
          const totalConverted = convertedQty * packCount;
          pricePerUnit = priceNumber / totalConverted;
          unitType = 'oz';
        }
      }
    }

    if (name && priceText) {
      products.push({
        name,
        price: priceText,
        priceNumber,
        size: unitSize || '',
        sizeQty,
        sizeUnit,
        unit: perUnitText || '',
        unitQty,
        unitType,
        convertedQty,
        pricePerUnit,
        image,
        link
      });
    }
  });
  return products;
}

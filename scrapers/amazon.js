export function scrapeAmazon() {
  const UNIT_FACTORS = {
    oz: 1,
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


  function parseUnitInfo(name, unitText, sizeText) {
    const fields = [unitText, sizeText, name];
    let unitSize = null;
    let unit = null;
    for (const field of fields) {
      if (!field) continue;
      const m = field.match(/([\d.]+)[\s-]*(oz|ounce|fluid ounce|fl oz|g|gram|kg|ml|l)/i);
      if (m) {
        unitSize = parseFloat(m[1]);
        unit = m[2].toLowerCase();
        break;
      }
    }
    if (unit) {
      unit = unit.replace(/\s+/g, '');
      if (unit === 'ounce' || unit === 'ounces' || unit === 'floz' || unit === 'fluidounce' || unit === 'flounce') unit = 'oz';
      else if (unit === 'gram') unit = 'g';
    }

    const packFields = [name, unitText, sizeText];
    let packCount = 1;
    for (const field of packFields) {
      if (!field) continue;
      let m = field.match(/pack\s*of\s*(\d+)/i);
      if (!m) m = field.match(/(\d+)\s*[xX]/);
      if (!m) m = field.match(/(\d+)\s*(?:pack|ct|count)/i);
      if (m) {
        packCount = parseInt(m[1], 10);
        break;
      }
    }
    return { unitSize, unit, packCount };
  }

  const products = [];
  const tiles = document.querySelectorAll(
    'div[data-asin][data-component-type="s-search-result"]'
  );
  tiles.forEach(tile => {
    const link = tile.querySelector('a.a-link-normal.s-no-outline')?.href || '';
    const name = tile.querySelector('h2.a-size-base-plus span')?.innerText?.trim();
    const image = tile.querySelector('img.s-image')?.src || '';
    const priceText = tile.querySelector('span.a-price span.a-offscreen')?.innerText?.trim();
    const unitText = tile
      .querySelector('span.a-size-base.a-color-secondary span.a-price.a-text-price span.a-offscreen')
      ?.innerText?.trim();
    const countText = tile
      .querySelector('span.a-size-base.a-color-base')
      ?.innerText?.trim();

    const unitInfo = parseUnitInfo(name, unitText, countText);
    const packCount = unitInfo.packCount;

    let priceNumber = null;
    if (priceText) {
      const p = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }

    let pricePerUnit = null;
    let unitType = null;
    if (unitText) {
      const m = unitText.match(/\$([\d.]+)\s*\/\s*(\w+)/);
      if (m) {
        pricePerUnit = parseFloat(m[1]);
        unitType = m[2];
      }
    }

    let sizeQty = unitInfo.unitSize;
    let sizeUnit = unitInfo.unit;

    let convertedQty = null;
    if (sizeQty != null && sizeUnit && UNIT_FACTORS[sizeUnit]) {
      const totalQty = sizeQty * packCount;
      convertedQty = sizeQty * UNIT_FACTORS[sizeUnit];
      if (priceNumber != null && totalQty != null) {
        const totalConverted = totalQty * UNIT_FACTORS[sizeUnit];
        if (
          pricePerUnit == null ||
          /count/i.test(unitText) ||
          (unitType && /count/i.test(unitType))
        ) {
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
        size: countText || '',
        sizeQty,
        sizeUnit,
        unit: unitText || '',
        unitQty: null,
        unitType,
        convertedQty,
        pricePerUnit,
        image,
        link
      });
    }
  });

  products.sort((a, b) => {
    const aPrice = a.pricePerUnit ?? Infinity;
    const bPrice = b.pricePerUnit ?? Infinity;
    return aPrice - bPrice;
  });

  return products;
}

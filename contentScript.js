console.log("✅ contentScript.js loaded on page:", window.location.href);
function getImageSrc(el) {
  if (!el) return "";
  const attrs = ["src", "data-src", "data-original", "data-image-src", "data-lazy", "data-lazy-src"];
  for (const attr of attrs) {
    const val = el.getAttribute && el.getAttribute(attr);
    if (val) {
      try {
        return new URL(val, location.href).href;
      } catch (_) {
        return val;
      }
    }
  }
  const srcset = (el.getAttribute && el.getAttribute("data-srcset")) || (el.getAttribute && el.getAttribute("srcset"));
  if (srcset) {
    const first = srcset.split(",")[0].trim().split(" ")[0];
    try {
      return new URL(first, location.href).href;
    } catch (_) {
      return first;
    }
  }
  const style = el.style && el.style.backgroundImage;
  if (style) {
    const m = style.match(/url\("?(.*?)"?\)/);
    if (m && m[1]) {
      try {
        return new URL(m[1], location.href).href;
      } catch (_) {
        return m[1];
      }
    }
  }
  if (el.currentSrc) return el.currentSrc;
  if (el.src) return el.src;
  return "";
}


function scrapeStopAndShop() {
  const UNIT_FACTORS = {
    oz: 1,
    lb: 16,
    g: 0.035274,
    kg: 35.274,
    ml: 0.033814,
    l: 33.814,
    gal: 128,
    ga: 128,
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

  const sanitize = str =>
    str?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();

  const matchPack = str => {
    if (!str) return null;
    const s = sanitize(str);
    return (
      s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i) ||
      s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i) ||
      s.match(/pack\s*of\s*(\d+)/i) ||
      s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i)
    );
  };

  const getPackCount = (name, size, unit) => {
    let m = matchPack(name);
    if (!m) m = matchPack(size);
    if (!m) m = matchPack(unit);
    return m ? parseInt(m[1], 10) : 1;
  };


  const products = [];
  const tiles = document.querySelectorAll('li.tile.product-cell.product-grid-cell');
  console.log(`🧱 Found ${tiles.length} product tiles`);
  tiles.forEach((tile, index) => {
    console.log(`🔍 Tile ${index + 1} innerHTML:`, tile.innerHTML);
    const name = tile.querySelector('.product-grid-cell_price-container > .sr-only')?.innerText?.trim();

    const priceText = tile.querySelector('.product-grid-cell_main-price')?.innerText?.trim();

    const unitSize = tile.querySelector('.product-grid-cell_size')?.innerText?.trim();

    const perUnitText = tile.querySelector('.product-grid-cell_unit')?.innerText?.trim();

    const packCount = getPackCount(name, unitSize, perUnitText);
    const image = getImageSrc(tile.querySelector('img'));
    const link = tile.querySelector('a[href*="/product/"]')?.href || '';

    let unitQty = null;
    let unitType = null;
    let pricePerUnit = null;
    if (perUnitText) {
      const isCent = perUnitText.includes('¢');
      const clean = perUnitText.replace(/[^0-9./a-zA-Z]/g, '');
      const match = clean.match(/([\d.]+)\/([\d.]*)\s*([a-zA-Z]+)/);
      if (match) {
        const priceVal = parseNumber(match[1]) / (isCent ? 100 : 1);
        const qtyVal = parseNumber(match[2]);
        unitQty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        unitType = match[3].replace(/[\s.]+/g, '');
        if (!isNaN(priceVal)) {
          pricePerUnit = priceVal / unitQty;
        }
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
      const m = unitSize.match(/([\d./]+)\s*([a-zA-Z]+)/);
      if (m) {
        sizeQty = parseNumber(m[1]);
        sizeUnit = m[2].replace(/[\s.]+/g, '');
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
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null && pricePerUnit == null) {
          pricePerUnit = priceNumber / convertedQty;
        }
      }
    }

    if (name && priceText) {
      console.log(`🧾 Tile ${index + 1}:`, {
        name,
        price: priceText,
        unitSize,
        pricePerUnit: perUnitText,
        image,
        link
      });
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

function extractWalmartPrice(tile) {
  const container = tile.querySelector('[data-automation-id="product-price"]');
  if (!container) return { priceText: '', priceNumber: null };

  const charEl = container.querySelector('[data-automation-id="price-characteristic"], .price-characteristic');
  const mantEl = container.querySelector('[data-automation-id="price-mantissa"], .price-mantissa');

  let num = null;
  if (charEl && mantEl) {
    const characteristic = charEl.textContent.replace(/[^0-9]/g, '').trim();
    const mantissa = mantEl.textContent.replace(/[^0-9]/g, '').trim();
    if (characteristic) {
      num = parseFloat(`${characteristic}.${mantissa || '00'}`);
    }
  }

  if (num == null || isNaN(num)) {
    const text = container.textContent.trim();
    const parsed = parseFloat(text.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) num = parsed;
  }

  const text = num != null && !isNaN(num) ? `$${num.toFixed(2)}` : container.textContent.trim();
  return { priceText: text, priceNumber: num != null && !isNaN(num) ? num : null };
}

function scrapeWalmart() {
  const UNIT_FACTORS = {
    oz: 1,
    lb: 16,
    g: 0.035274,
    kg: 35.274,
    ml: 0.033814,
    l: 33.814,
    gal: 128,
    ga: 128,
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

  const sanitize = str =>
    str?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();

  const matchPack = str => {
    if (!str) return null;
    const s = sanitize(str);
    return (
      s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i) ||
      s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i) ||
      s.match(/pack\s*of\s*(\d+)/i) ||
      s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i)
    );
  };

  const getPackCount = (name, size, unit) => {
    let m = matchPack(name);
    if (!m) m = matchPack(size);
    if (!m) m = matchPack(unit);
    return m ? parseInt(m[1], 10) : 1;
  };

  const products = [];
  const tiles = document.querySelectorAll('[data-item-id], [data-testid="list-view"]');
  tiles.forEach((tile, index) => {
    const name = tile.querySelector('[data-automation-id="product-title"]')?.innerText?.trim();
    const { priceText, priceNumber: extractedNumber } = extractWalmartPrice(tile);
    const perUnitText =
      tile.querySelector('[data-testid="product-price-per-unit"]')?.innerText?.trim() ||
      tile.querySelector('.gray')?.innerText?.trim();
    let unitSize = null;
    const sizeMatch = name?.match(/([\d./]+)\s*(fl\.?\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/i);
    if (sizeMatch) {
      unitSize = `${sizeMatch[1]} ${sizeMatch[2]}`;
    }

    const packCount = getPackCount(name, unitSize, perUnitText);
    const image = getImageSrc(tile.querySelector('img[data-testid="productTileImage"]'));
    const link = tile.querySelector('a[href*="/ip/"]')?.href || '';

    let unitQty = null;
    let unitType = null;
    let pricePerUnit = null;
    if (perUnitText) {
      const isCent = perUnitText.includes('¢');
      const clean = perUnitText.replace(/[^0-9./a-zA-Z]/g, '');
      const match = clean.match(/([\d.]+)\/([\d.]*)\s*([a-zA-Z]+)/);
      if (match) {
        const priceVal = parseNumber(match[1]) / (isCent ? 100 : 1);
        const qtyVal = parseNumber(match[2]);
        unitQty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        unitType = match[3].replace(/[\s.]+/g, '');
        if (!isNaN(priceVal)) {
          pricePerUnit = priceVal / unitQty;
        }
      }
    }

    let priceNumber = extractedNumber;

    let sizeQty = null;
    let sizeUnit = null;
    if (unitSize) {
      const m = unitSize.match(/([\d./]+)\s*([a-zA-Z]+)/);
      if (m) {
        sizeQty = parseNumber(m[1]);
        sizeUnit = m[2].replace(/[\s.]+/g, '');
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
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null && pricePerUnit == null) {
          pricePerUnit = priceNumber / convertedQty;
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

function scrapeAmazon() {
  const UNIT_FACTORS = {
    oz: 1,
    lb: 16,
    g: 0.035274,
    kg: 35.274,
    ml: 0.033814,
    l: 33.814,
    gal: 128,
    ga: 128,
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
    const fields = [sizeText, name, unitText];
    let unitSize = null;
    let unit = null;
    for (const field of fields) {
      if (!field) continue;
      if (field.includes('$') || field.includes('¢')) continue;
      const m = field.match(/([\d./]+)[\s-]*(oz|ounce|fluid ounce|fl oz|g|gram|kg|ml|l|gal|gallon|gallons|lb|lbs?|pound|pounds)\b/i);
      if (m) {
        unitSize = parseNumber(m[1]);
        unit = m[2].toLowerCase();
        break;
      }
    }
    if (unit) {
      unit = unit.replace(/\s+/g, '');
      if (unit === 'ounce' || unit === 'ounces' || unit === 'floz' || unit === 'fluidounce' || unit === 'flounce') unit = 'oz';
      else if (unit === 'gram') unit = 'g';
      else if (unit === 'gallon' || unit === 'gallons') unit = 'gal';
      else if (unit === 'lbs' || unit === 'pound' || unit === 'pounds') unit = 'lb';
    }

    const packFields = [name, unitText, sizeText];
    let packCount = 1;
    for (const field of packFields) {
      if (!field) continue;
      let m = field.match(/pack\s*of\s*(\d+)/i);
      if (!m) m = field.match(/(\d+)\s*[xX]/);
      if (!m) m = field.match(/(\d+)\s*(?:pack|pk|ct|count)/i);
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
      const image = getImageSrc(tile.querySelector('img.s-image'));
    const priceText = tile
      .querySelector('span.a-price span.a-offscreen')?.innerText?.trim();
    const unitText = tile
      .querySelector('span.a-size-base.a-color-secondary')
      ?.innerText?.trim();
    const countText = tile
      .querySelector('span.a-size-base.a-color-base')?.innerText?.trim();

    const unitInfo = parseUnitInfo(name, unitText, countText);
    const packCount = unitInfo.packCount;

    let priceNumber = null;
    if (priceText) {
      const p = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }

    let pricePerUnit = null;
    let unitType = null;
    let unitQty = null;
    if (unitText) {
      const parsed = parseUnitPrice(unitText);
      if (parsed) {
        pricePerUnit = parsed.pricePerUnit;
        unitType = parsed.unitType;
        unitQty = parsed.unitQty;
      } else {
        const m = unitText.match(/\$([\d.]+).*\/(\w+)/);
        if (m) {
          pricePerUnit = parseFloat(m[1]);
          unitType = m[2].toLowerCase();
        }
      }
    }

    if ((unitType === 'count' || unitType === 'ct') && priceNumber != null) {
      if (pricePerUnit == null) {
        pricePerUnit = priceNumber / packCount;
      }
    } else if (!unitText && priceNumber != null && packCount) {
      pricePerUnit = priceNumber / packCount;
      unitType = 'count';
    }

    if (pricePerUnit == null && priceNumber != null && packCount > 1) {
      pricePerUnit = priceNumber / packCount;
      unitType = 'count';
    }

    const baseSizeQty = unitInfo.unitSize;
    let sizeQty = baseSizeQty != null ? baseSizeQty * packCount : null;
    let sizeUnit = unitInfo.unit;
    let size = baseSizeQty != null ? String(baseSizeQty) : countText || '';

    let convertedQty = null;
    if (baseSizeQty != null && sizeUnit && UNIT_FACTORS[sizeUnit]) {
      const totalQty = baseSizeQty * packCount;
      convertedQty = totalQty * UNIT_FACTORS[sizeUnit];
      if (priceNumber != null && totalQty != null) {
        const totalConverted = totalQty * UNIT_FACTORS[sizeUnit];
        if (pricePerUnit == null && unitType !== 'count' && unitType !== 'ct') {
          pricePerUnit = priceNumber / totalConverted;
          unitType = 'oz';
          unitQty = 1;
        }
      }
    }

    if (name && priceText) {
      products.push({
        name,
        price: priceText,
        priceNumber,
        size,
        sizeQty,
        sizeUnit,
        unit: unitText || '',
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

function scrapeShaws() {
  const UNIT_FACTORS = {
    oz: 1,
    floz: 1,
    lb: 16,
    g: 0.035274,
    kg: 35.274,
    ml: 0.033814,
    l: 33.814,
    gal: 128,
    ga: 128,
    qt: 32,
    pt: 16,
    cup: 8,
    tbsp: 0.5,
    tsp: 0.1667,
    ea: 1,
    ct: 1,
    count: 1,
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

  const WEIGHT_UNITS = new Set([
    'oz',
    'floz',
    'lb',
    'kg',
    'ml',
    'l',
    'gal',
    'g',
    'qt',
    'pt',
    'cup',
    'tbsp',
    'tsp'
  ]);

  const COUNT_UNITS = new Set([
    'ea',
    'ct',
    'count',
    'pkg',
    'box',
    'can',
    'bag',
    'bottle',
    'stick',
    'roll',
    'bar',
    'pouch',
    'jar',
    'packet',
    'sleeve',
    'slice',
    'piece',
    'tube',
    'tray',
    'unit'
  ]);

  function extractSize(text) {
    if (!text) return [null, null];
    let normalized = text.toLowerCase();
    for (const [word, abbr] of Object.entries(UNIT_ALIASES)) {
      const r = new RegExp(`\\b${word}\\b`, 'g');
      normalized = normalized.replace(r, abbr);
    }
    const hyphenMatch = normalized.match(/\b\d+\s*-\s*([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp)/i);
    if (hyphenMatch) {
      let unit = hyphenMatch[2].toLowerCase().replace(/\s+/g, '');
      if (unit === 'floz') unit = 'oz';
      unit = UNIT_ALIASES[unit] || unit;
      const qty = parseFloat(hyphenMatch[1]);
      return [qty, unit];
    }
    const regex = /([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|count|pkg|box|can|bag|bottle|stick|roll|bar|pouch|jar|packet|sleeve|slice|piece|tube|tray|unit)/gi;
    let weightPair = null;
    let countPair = null;
    for (const m of normalized.matchAll(regex)) {
      let unit = m[2].toLowerCase().replace(/\s+/g, '');
      if (unit === 'floz') unit = 'oz';
      else if (unit === 'count') unit = 'ct';
      unit = UNIT_ALIASES[unit] || unit;
      const qty = parseFloat(m[1]);
      if (WEIGHT_UNITS.has(unit)) {
        if (!weightPair) weightPair = [qty, unit];
      } else if (COUNT_UNITS.has(unit)) {
        if (!countPair) countPair = [qty, unit];
      }
    }
    return weightPair || countPair || [null, null];
  }

  const products = [];
  const tiles = document.querySelectorAll('product-item-al-v2');
  tiles.forEach(tile => {
    const titleEl = tile.querySelector('[data-qa="prd-itm-pttl"]');
    const name = titleEl?.innerText?.trim();
    const packMatch = name?.match(/(\d+)\s*(?:pk|pack|ct|count)/i);
    const packCount = packMatch ? parseInt(packMatch[1], 10) : 1;
    const linkRel = titleEl?.getAttribute('href');
    const link = linkRel ? new URL(linkRel, 'https://www.shaws.com').href : '';
    const priceText = tile.querySelector('[data-qa="prd-itm-prc"]')?.innerText?.trim();
    const sizeText = tile.querySelector('[data-qa="prd-itm-sqty"]')?.innerText?.trim();
    const unitText = (
      tile.querySelector('[data-qa="prd-itm-upr"]')?.textContent ||
      tile.querySelector('[data-qa="prd-itm-pprc-qty"]')?.textContent ||
      ''
    ).trim();
    const image = getImageSrc(tile.querySelector('img[data-qa="prd-itm-img"]'));

    let priceNumber = null;
    if (priceText) {
      const p = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }

    let sizeQty = null;
    let sizeUnit = null;

    const [qtyFromText, unitFromText] = extractSize(sizeText);
    const [qtyFromName, unitFromName] = extractSize(name);

    const isWeightText = unitFromText && WEIGHT_UNITS.has(unitFromText.toLowerCase());
    const isWeightName = unitFromName && WEIGHT_UNITS.has(unitFromName.toLowerCase());

    if (isWeightText && isWeightName) {
      const ozText = qtyFromText * (UNIT_FACTORS[unitFromText.toLowerCase()] || 1);
      const ozName = qtyFromName * (UNIT_FACTORS[unitFromName.toLowerCase()] || 1);
      if (ozName > ozText) {
        sizeQty = qtyFromName;
        sizeUnit = unitFromName;
      } else {
        sizeQty = qtyFromText;
        sizeUnit = unitFromText;
      }
    } else if (isWeightText || isWeightName) {
      if (isWeightText) {
        sizeQty = qtyFromText;
        sizeUnit = unitFromText;
      } else {
        sizeQty = qtyFromName;
        sizeUnit = unitFromName;
      }
    } else {
      if (qtyFromText != null) {
        sizeQty = qtyFromText;
        sizeUnit = unitFromText;
      } else {
        sizeQty = qtyFromName;
        sizeUnit = unitFromName;
      }
    }

    let convertedQty = null;
    const parsedInfo = parseUnitPrice(unitText);
    let pricePerUnit = parsedInfo ? parsedInfo.pricePerUnit : null;
    let unitQty = parsedInfo ? parsedInfo.unitQty : null;
    let unitType = parsedInfo ? parsedInfo.unitType : null;
    if (pricePerUnit != null && unitType && WEIGHT_UNITS.has(unitType) && UNIT_FACTORS[unitType]) {
      pricePerUnit = pricePerUnit / UNIT_FACTORS[unitType];
      unitQty = 1;
      unitType = 'oz';
    }
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null && pricePerUnit == null) {
          pricePerUnit = priceNumber / convertedQty;
          unitQty = 1;
          unitType = sizeUnit.toLowerCase();
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
        packCount,
        image,
        link
      });
    }
  });
  return products;
}

function scrapeRocheBros() {
  const UNIT_FACTORS = {
    oz: 1,
    lb: 16,
    g: 0.035274,
    kg: 35.274,
    ml: 0.033814,
    l: 33.814,
    gal: 128,
    ga: 128,
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
  const tiles = document.querySelectorAll('li.product-wrapper.cell-wrapper');
  tiles.forEach(tile => {
    const name = tile.querySelector('.cell-title-text')?.innerText?.trim();
    const packMatch = name?.match(/(\d+)\s*(?:pk|pack|ct|count)/i);
    const packCount = packMatch ? parseInt(packMatch[1], 10) : 1;
      const image = getImageSrc(tile.querySelector(".cell-image"));
    const link = tile.querySelector('a[href]')?.href || '';
    const addBtn = tile.querySelector('button[data-test="add-to-cart-button"]') ||
      tile.querySelector('button[data-test-id^="add-to-cart-button"]');
    const addToCartId = addBtn?.id || addBtn?.getAttribute('data-test-id') || '';
    const priceText = tile.querySelector('span[data-test="amount"] span')?.innerText?.trim();
    const perUnitText = tile.querySelector('span[data-test="per-unit-price"]')?.innerText?.trim();
    const sizeText = tile.querySelector('.cell-product-size')?.innerText?.trim();

    let priceNumber = null;
    if (priceText) {
      const p = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }

    let unitQty = null;
    let unitType = null;
    if (perUnitText) {
      const clean = perUnitText.replace(/[^0-9./a-zA-Z]/g, '');
      const match = clean.match(/([\d./]+)\/([a-zA-Z]+)/);
      if (match) {
        unitQty = parseNumber(match[1]);
        unitType = match[2];
      }
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      const m = sizeText.match(/([\d./]+)\s*([a-zA-Z]+)/);
      if (m) {
        sizeQty = parseNumber(m[1]);
        sizeUnit = m[2];
      }
    }

    let convertedQty = null;
    let pricePerUnit = null;
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null) {
          pricePerUnit = priceNumber / convertedQty;
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
        unit: perUnitText || '',
        unitQty,
        unitType,
        convertedQty,
        pricePerUnit,
        packCount,
        image,
        link,
        addToCartId
      });
    }
  });
  return products;
}

function scrapeHannaford() {
  const UNIT_FACTORS = {
    oz: 1,
    lb: 16,
    g: 0.035274,
    kg: 35.274,
    ml: 0.033814,
    l: 33.814,
    gal: 128,
    ga: 128,
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
  const tiles = document.querySelectorAll('div.catalog-product');
  tiles.forEach(tile => {
    const linkRel = tile.getAttribute('href') || tile.getAttribute('data-url');
    const link = linkRel
      ? new URL(linkRel, 'https://www.hannaford.com').href
      : '';
    const name = tile.querySelector('.productName .real-product-name')?.innerText?.trim();
    const packMatch = name?.match(/(\d+)\s*(?:pk|pack|ct|count)/i);
    const packCount = packMatch ? parseInt(packMatch[1], 10) : 1;
    const priceText = tile.querySelector('.priceCell .item-unit-price')?.innerText?.trim();
    const priceHidden = tile.querySelector('.priceCell .item-price')?.value;
    const sizeText = tile.querySelector('.overline.text-truncate')?.innerText?.trim();
    const unitText = tile.querySelector('.unitPriceDisplay')?.innerText?.trim();
      const image = getImageSrc(tile.querySelector('img'));

    let priceNumber = null;
    if (priceHidden) {
      const p = parseFloat(priceHidden);
      if (!isNaN(p)) priceNumber = p;
    } else if (priceText) {
      const m = priceText.match(/\$?([0-9.]+)/);
      if (m) priceNumber = parseFloat(m[1]);
    }

    let unitQty = null;
    let unitType = null;
    if (unitText) {
      const clean = unitText.replace(/[^0-9./a-zA-Z]/g, '');
      const match = clean.match(/([\d./]+)\/([a-zA-Z]+)/);
      if (match) {
        unitQty = parseNumber(match[1]);
        unitType = match[2];
      }
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      const m = sizeText.match(/([\d./]+)\s*([a-zA-Z]+)/);
      if (m) {
        sizeQty = parseNumber(m[1]);
        sizeUnit = m[2];
      }
    }

    let convertedQty = null;
    let pricePerUnit = null;
    if (sizeQty != null && sizeUnit) {
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        if (priceNumber != null) {
          pricePerUnit = priceNumber / convertedQty;
        }
      }
    }

    if (name && (priceText || priceNumber != null)) {
      products.push({
        name,
        price: priceText || (priceNumber != null ? `$${priceNumber.toFixed(2)}` : ''),
        priceNumber,
        size: sizeText || '',
        sizeQty,
        sizeUnit,
        unit: unitText || '',
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

function runScrape() {
  chrome.storage.local.get('currentItemInfo', info => {
    const { item = '', store = 'Stop & Shop' } = info.currentItemInfo || {};
    let data = [];
    if (store === 'Stop & Shop') {
      data = scrapeStopAndShop();
    } else if (store === 'Walmart') {
      data = scrapeWalmart();
    } else if (store === 'Amazon') {
      data = scrapeAmazon();
    } else if (store === 'Shaws') {
      data = scrapeShaws();
    } else if (store === 'Roche Bros') {
      data = scrapeRocheBros();
    } else if (store === 'Hannaford') {
      data = scrapeHannaford();
    }
    chrome.runtime.sendMessage({ type: 'scrapedData', item, store, products: data });
  });
}

// Automatically run shortly after load in case the page is ready
setTimeout(runScrape, 1000);

// Listen for manual trigger from extension UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'triggerScrape') {
    runScrape();
  } else if (message.type === 'simulateClick' && message.selector) {
    const el = document.querySelector(message.selector);
    if (el) el.click();
  }
});

const UNIT_ALIASES = {
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  perpound: 'lb',
  perlb: 'lb',
  floz: 'oz',
  fluidounce: 'oz',
  flounce: 'oz'
};

function normalizeUnit(unit) {
  if (!unit) return unit;
  const key = unit.toLowerCase().replace(/\s+/g, '').replace(/\./g, '');
  return UNIT_ALIASES[key] || key;
}

function parseUnitPrice(text) {
  if (!text) return null;
  text = text.trim();
  const paren = text.match(/\(([^()]+)\)/);
  if (paren) {
    const inner = parseUnitPrice(paren[1].trim());
    if (inner) return inner;
  }
  text = text.replace(/[()]/g, '');

  let m = text.match(/\$([\d.]+)\s*for\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\.]+)/i);
  if (m) {
    const price = parseFloat(m[1]);
    const qty = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.]+/g, '');
    unitType = normalizeUnit(unitType);
    if (!isNaN(price) && !isNaN(qty) && qty !== 0) {
      return { pricePerUnit: price / qty, unitType, unitQty: qty };
    }
  }

  m = text.match(/\$([\d.]+)\s*\/\s*(\d+)([a-zA-Z\.]+)/);
  if (m) {
    const price = parseFloat(m[1]);
    const qty = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.]+/g, '');
    unitType = normalizeUnit(unitType);
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/\$([\d.]+)\s*\/\s*([\d.]*)\s*([a-zA-Z\.]+(?:\s*[a-zA-Z\.]+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    const qtyVal = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.]+/g, '');
    unitType = normalizeUnit(unitType);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/([\d.]+)\s*\u00A2\s*\/\s*([\d.]*)\s*([a-zA-Z\.]+(?:\s*[a-zA-Z\.]+)?)/);
  if (m) {
    const price = parseFloat(m[1]) / 100;
    const qtyVal = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.]+/g, '');
    unitType = normalizeUnit(unitType);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/price\s*per\s*(\d+(?:\.\d+)?)\s*([a-zA-Z\.]+(?:\s*[a-zA-Z\.]+)*)\s*\$([\d.]+)/i);
  if (m) {
    const qtyVal = parseFloat(m[1]);
    let unitType = m[2].toLowerCase().replace(/[\s.]+/g, '');
    unitType = normalizeUnit(unitType);
    const price = parseFloat(m[3]);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/price\s*per\s*([\d.]+)\s*([a-zA-Z\.]+)\s*\$([\d.]+)/i);
  if (m) {
    const qtyVal = parseFloat(m[1]);
    let unitType = m[2].toLowerCase().replace(/[\s.]+/g, '');
    unitType = normalizeUnit(unitType);
    const price = parseFloat(m[3]);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  m = text.match(/([\d.]+)\s*\/\s*([\d.]*)\s*([a-zA-Z\.]+(?:\s*[a-zA-Z\.]+)?)/);
  if (m) {
    const price = parseFloat(m[1]);
    const qtyVal = parseFloat(m[2]);
    let unitType = m[3].toLowerCase().replace(/[\s.]+/g, '');
    unitType = normalizeUnit(unitType);
    const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
    return { pricePerUnit: price / qty, unitType, unitQty: qty };
  }

  return null;
}

function parseNumber(str) {
  if (typeof str !== "string") return NaN;
  let s = str.trim();
  if (!s) return NaN;
  const FRACTIONS = {"½":0.5,"¼":0.25,"¾":0.75,"⅓":1/3,"⅔":2/3,"⅛":1/8,"⅜":3/8,"⅝":5/8,"⅞":7/8};
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  for (const [u,v] of Object.entries(FRACTIONS)) {
    if (s.includes(u)) s = s.replace(new RegExp(u,"g"), ` ${v} `);
  }
  s = s.trim();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1],10) + parseInt(m[2],10)/parseInt(m[3],10);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return parseInt(m[1],10) / parseInt(m[2],10);
  m = s.match(/^(\d+)-(?:(\d+)\/(\d+))$/);
  if (m) return parseInt(m[1],10) + parseInt(m[2],10)/parseInt(m[3],10);
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}


console.log("✅ contentScript.js loaded on page:", window.location.href);

function scrapeStopAndShop() {
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

  const products = [];
  const tiles = document.querySelectorAll('li.tile.product-cell.product-grid-cell');
  console.log(`🧱 Found ${tiles.length} product tiles`);
  tiles.forEach((tile, index) => {
    console.log(`🔍 Tile ${index + 1} innerHTML:`, tile.innerHTML);
    const name = tile.querySelector('.product-grid-cell_price-container > .sr-only')?.innerText?.trim();

    const priceText = tile.querySelector('.product-grid-cell_main-price')?.innerText?.trim();

    const unitSize = tile.querySelector('.product-grid-cell_size')?.innerText?.trim();

    const perUnitText = tile.querySelector('.product-grid-cell_unit')?.innerText?.trim();
    const image = tile.querySelector('img')?.src || '';
    const link = tile.querySelector('a[href*="/product/"]')?.href || '';

    let unitQty = null;
    let unitType = null;
    if (perUnitText) {
      const clean = perUnitText.replace(/[^0-9./a-zA-Z]/g, '');
      const match = clean.match(/([\d.]+)\/([a-zA-Z]+)/);
      if (match) {
        unitQty = parseFloat(match[1]);
        unitType = match[2];
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
      const m = unitSize.match(/([\d.]+)\s*([a-zA-Z]+)/);
      if (m) {
        sizeQty = parseFloat(m[1]);
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
      console.log(`🧾 Tile ${index + 1}:`, {
        name,
        price: priceText,
        unitSize,
        pricePerUnit: perUnitText,
        image,
        link
      });
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

function scrapeWalmart() {
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

  const products = [];
  const tiles = document.querySelectorAll('[data-testid="list-view"] > div');
  tiles.forEach((tile, i) => {
    const name = tile.querySelector('[data-automation-id="product-title"]')?.innerText?.trim();
    const packMatch = name?.match(/(\d+)\s*pack/i);
    const packCount = packMatch ? parseInt(packMatch[1], 10) : 1;
    const priceMatch = tile.querySelector('[data-automation-id="product-price"]')?.innerText?.match(/\$?\d+\.\d{2}/);
    const price = priceMatch ? priceMatch[0] : null;
    let priceNumber = null;
    if (price) {
      const p = parseFloat(price.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }
    const perUnitText = tile.querySelector('.gray')?.innerText?.trim();
    let pricePerUnit = null;
    let unitType = null;
    let sizeQty = null;
    let sizeUnit = null;
    let convertedQty = null;

    const sizeMatch = name?.match(/(\d+(?:\.\d+)?)\s*(fl\s*oz|oz|lb|g|kg|ml|l|ct)/i);
    if (sizeMatch) {
      sizeQty = parseFloat(sizeMatch[1]);
      sizeUnit = sizeMatch[2].replace(/\s+/g, '');
      // Removed adjustment that divided size by packCount so that the
      // full item weight is used when computing price per unit.
      // if (packCount > 1) {
      //   sizeQty = sizeQty / packCount;
      // }
      const factor = UNIT_FACTORS[sizeUnit.toLowerCase()];
      if (factor) {
        convertedQty = sizeQty * factor;
        unitType = 'oz';
        if (price) {
          const p = parseFloat(price.replace(/[^0-9.]/g, ''));
          if (!isNaN(p)) {
            pricePerUnit = p / (convertedQty * packCount);
          }
        }
      }
    }

    if (pricePerUnit == null) {
      const match = perUnitText?.match(/\$([\d.]+)\/?\s*([\d.]*)\s*(\w+)/);
      if (match) {
        let priceVal = parseFloat(match[1]);
        const qtyVal = parseFloat(match[2]);
        const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
        pricePerUnit = priceVal / qty;
        unitType = match[3].toLowerCase();
        const factor = UNIT_FACTORS[unitType];
        if (factor) {
          pricePerUnit = pricePerUnit / factor;
          unitType = 'oz';
        }
      }
    }
    const image = tile.querySelector('img[data-testid="productTileImage"]')?.src || '';
    const link = tile.querySelector('a[href*="/ip/"]')?.href || '';
    if (name && price) {
      products.push({
        name,
        price,
        priceNumber,
        size: '',
        sizeQty,
        sizeUnit,
        unit: perUnitText || '',
        unitQty: null,
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

function scrapeAmazon() {
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
    const priceText = tile
      .querySelector('span.a-price span.a-offscreen')?.innerText?.trim();
    const unitText = tile
      .querySelector(
        'span.a-size-base.a-color-secondary span.a-price.a-text-price span.a-offscreen'
      )?.innerText?.trim();
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
  return products;
}

function scrapeShaws() {
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

  const products = [];
  const tiles = document.querySelectorAll('product-item-al-v2');
  tiles.forEach(tile => {
    const titleEl = tile.querySelector('[data-qa="prd-itm-pttl"]');
    const linkRel = titleEl?.getAttribute('href');
    const link = linkRel ? new URL(linkRel, 'https://www.shaws.com').href : '';
    const name = titleEl?.innerText?.trim();
    const priceText = tile.querySelector('[data-qa="prd-itm-prc"]')?.innerText?.trim();
    const sizeText = tile.querySelector('[data-qa="prd-itm-sqty"]')?.innerText?.trim();
    const image = tile.querySelector('img[data-qa="prd-itm-img"]')?.src || '';

    let priceNumber = null;
    if (priceText) {
      const p = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!isNaN(p)) priceNumber = p;
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      const m = sizeText.match(/([\d.]+)\s*(\w+)/);
      if (m) {
        sizeQty = parseFloat(m[1]);
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
        unit: '',
        unitQty: null,
        unitType: null,
        convertedQty,
        pricePerUnit,
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
    const image = tile.querySelector('.cell-image')?.getAttribute('data-src') || '';
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
      const match = clean.match(/([\d.]+)\/([a-zA-Z]+)/);
      if (match) {
        unitQty = parseFloat(match[1]);
        unitType = match[2];
      }
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      const m = sizeText.match(/([\d.]+)\s*([a-zA-Z]+)/);
      if (m) {
        sizeQty = parseFloat(m[1]);
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
    const priceText = tile.querySelector('.priceCell .item-unit-price')?.innerText?.trim();
    const priceHidden = tile.querySelector('.priceCell .item-price')?.value;
    const sizeText = tile.querySelector('.overline.text-truncate')?.innerText?.trim();
    const unitText = tile.querySelector('.unitPriceDisplay')?.innerText?.trim();
    const image = tile.querySelector('img')?.src || '';

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
      const match = clean.match(/([\d.]+)\/([a-zA-Z]+)/);
      if (match) {
        unitQty = parseFloat(match[1]);
        unitType = match[2];
      }
    }

    let sizeQty = null;
    let sizeUnit = null;
    if (sizeText) {
      const m = sizeText.match(/([\d.]+)\s*([a-zA-Z]+)/);
      if (m) {
        sizeQty = parseFloat(m[1]);
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

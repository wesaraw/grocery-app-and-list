import fs from 'fs';
import { JSDOM } from 'jsdom';
const {
  parseUnitPrice,
  SHEET_SQFT,
  getPriceUnitInfo,
  sheetSqFtFor,
  UNIT_ALIASES
} = await import('../utils/priceUtils.js');
const { initUomTable, convert } = await import('../utils/uomConverter.js');
const { roundQuantity } = await import('../utils/quantityFormat.js');
import { pathToFileURL } from 'url';
global.chrome = { runtime: { getURL: p => pathToFileURL(process.cwd() + '/' + p).href } };
global.fetch = async url => ({ json: async () => JSON.parse(fs.readFileSync(new URL(url), 'utf8')) });

const html = fs.readFileSync('test/samples/shaws-toilet-paper.html', 'utf8');
const dom = new JSDOM(html);
const tile = dom.window.document.querySelector('product-item-al-v2');
const unitText = tile.querySelector('[data-qa="prd-itm-pprc-qty"]').textContent.trim();
const priceText = tile.querySelector('[data-qa="prd-itm-prc"]').textContent.trim();
const priceNumber = parseFloat(priceText.replace(/[^0-9.]/g, ''));
const info = parseUnitPrice(unitText);
if (!info) throw new Error('Failed to parse unit price');
const pricePerSheet = info.pricePerUnit * SHEET_SQFT;
console.log('pricePerSheet', pricePerSheet.toFixed(4));
if (Math.abs(pricePerSheet - 0.0069) > 0.0002) {
  throw new Error(`Expected around 0.0069 but got ${pricePerSheet}`);
}

const alt = parseUnitPrice('price per 100 sq. ft. $6.27');
if (!alt || Math.abs(alt.pricePerUnit * SHEET_SQFT - 0.0069) > 0.0002) {
  throw new Error('Alt format failed');
}

const alt2 = parseUnitPrice('$6.27 for 100sf');
if (!alt2 || Math.abs(alt2.pricePerUnit * SHEET_SQFT - 0.0069) > 0.0002) {
  throw new Error('For format failed');
}

await initUomTable();
const dozenRes = parseUnitPrice('$5.40/doz');
if (!dozenRes || dozenRes.unitType !== 'doz' || Math.abs(dozenRes.pricePerUnit - 5.40) > 0.0001) {
  throw new Error('Dozen parsing failed');
}
if (convert(1, 'doz', 'ea') !== 12) {
  throw new Error('Dozen conversion incorrect');
}

// Test pricePerHomeUnit with sheets
let needsData = [{ name: 'Bounty Paper Towels', home_unit: 'sheets' }];

function weightBasedEachCount(item, product, mult) {
  const gramsPerEach = item?.averageEachWeight?.gramsPerEach;
  if (!(gramsPerEach > 0)) return null;

  let grams = null;
  if (product.convertedQty != null) {
    grams = convert(product.convertedQty * mult, 'oz', 'g');
  } else if (product.sizeQty != null && product.sizeUnit) {
    grams = convert(product.sizeQty * mult, product.sizeUnit, 'g');
  }

  if (!(grams > 0)) return null;
  const count = grams / gramsPerEach;
  return Number.isFinite(count) && count > 0 ? count : null;
}

function extractSheetCount(itemName, product) {
  const sqft = sheetSqFtFor(itemName);
  const fields = [product?.name, product?.size, product?.unit];
  for (const f of fields) {
    if (!f) continue;
    const m = f.match(/(\d[\d,]*)\s*sheets?/i);
    if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    const sq = f.match(/(\d[\d,]*)\s*(?:sq\.?\s*ft|sqft|sf)/i);
    if (sq) return Math.round(parseInt(sq[1].replace(/,/g, ''), 10) / sqft);
  }
  const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
  if (ppu != null && ut && /^(?:sf|sqft)$/.test(ut) && product.priceNumber != null) {
    const totalSqFt = product.priceNumber / ppu;
    return Math.round(totalSqFt / sqft);
  }
  return null;
}

function pricePerHomeUnit(itemName, product) {
  const item = needsData.find(n => n.name === itemName);
  if (!item || !product) return null;
  const { count: pack, weightPerPack } = baseGetPackInfo(product);
  const mult = weightPerPack ? 1 : pack;
  const unit = item.home_unit ? item.home_unit.toLowerCase() : 'each';
  if (unit === 'sheets') {
    const sheetSqFt = sheetSqFtFor(itemName);
    const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
    if (ppu != null && ut) {
      if (/^(?:sf|sqft)$/.test(ut)) {
        return ppu * sheetSqFt;
      }
      if (/ct|count|sheet/.test(ut)) {
        return ppu;
      }
    }
    const totalSheets = extractSheetCount(itemName, product);
    if (totalSheets && product.priceNumber != null) {
      return product.priceNumber / (totalSheets * mult);
    }
  }
  if (unit === 'each') {
    const eachCount = weightBasedEachCount(item, product, mult) || pack;
    if (product.priceNumber != null && eachCount) {
      return product.priceNumber / eachCount;
    }
  }
  return null;
}

const product = {
  name: 'Bounty \u2026 12 Double Rolls, 82 Sheets Per Roll',
  priceNumber: 22.18,
  unit: '$2.25/100 ct'
};
const perSheet = pricePerHomeUnit('Bounty Paper Towels', product);
console.log('perSheet', perSheet);
if (perSheet == null || Math.abs(perSheet - 0.0225) > 0.0001) {
  throw new Error(`Expected around 0.0225 but got ${perSheet}`);
}

// Walmart Bounty paper towels parsing
const walmartHtml = fs.readFileSync('test/samples/walmart-bounty.html', 'utf8');
const walmartDom = new JSDOM(walmartHtml);
Object.defineProperty(walmartDom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = walmartDom.window.document;
global.window = walmartDom.window;
const { scrapeWalmart } = await import('../scrapers/walmart.js');
const walmartProducts = scrapeWalmart();
const walmartItem = walmartProducts.find(p => /12\s*Double\s*Rolls/i.test(p.name));
if (!walmartItem) throw new Error('Failed to find Walmart Bounty item');
if (walmartItem.packCount !== 12) {
  throw new Error(`Expected packCount 12 but got ${walmartItem.packCount}`);
}
const perSheetWalmart = pricePerHomeUnit('Bounty Paper Towels', walmartItem);
console.log('perSheetWalmart', perSheetWalmart);
  if (perSheetWalmart == null || Math.abs(perSheetWalmart - 0.02) > 0.001) {
    throw new Error(`Expected around 0.02 but got ${perSheetWalmart}`);
  }

// Stop & Shop plates regression
const stopHtml = fs.readFileSync('test/samples/stopandshop-plates.html', 'utf8');
const stopDom = new JSDOM(stopHtml);
Object.defineProperty(stopDom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = stopDom.window.document;
global.window = stopDom.window;
const { scrapeStopAndShop } = await import('../scrapers/stopandshop.js');
const stopProducts = scrapeStopAndShop();
const platesItem = stopProducts.find(p => /Everyday Plates/i.test(p.name));
if (!platesItem) {
  throw new Error('Failed to find Stop & Shop plates item');
}
if (platesItem.sizeQty !== 150) {
  throw new Error(`Expected sizeQty 150 but got ${platesItem.sizeQty}`);
}
if (platesItem.convertedQty !== 150) {
  throw new Error(`Expected convertedQty 150 but got ${platesItem.convertedQty}`);
}
if (platesItem.size !== '150 ct') {
  throw new Error(`Expected size string "150 ct" but got ${platesItem.size}`);
}
if (platesItem.pricePerUnit == null || Math.abs(platesItem.pricePerUnit - 0.09) > 0.0001) {
  throw new Error(`Expected pricePerUnit 0.09 but got ${platesItem.pricePerUnit}`);
}
if (platesItem.unitType !== 'ea') {
  throw new Error(`Expected unitType "ea" but got ${platesItem.unitType}`);
}

const dogTreatsHtml = fs.readFileSync('test/samples/stopandshop-dog-treats.html', 'utf8');
const dogTreatsDom = new JSDOM(dogTreatsHtml);
Object.defineProperty(dogTreatsDom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = dogTreatsDom.window.document;
global.window = dogTreatsDom.window;
const dogTreatProducts = scrapeStopAndShop();
const dentastixItem = dogTreatProducts.find(p => /Dentastix/i.test(p.name));
if (!dentastixItem) {
  throw new Error('Failed to find Stop & Shop Dentastix item');
}
if (Math.abs(dentastixItem.sizeQty - 26.7) > 0.0001) {
  throw new Error(`Expected sizeQty 26.7 but got ${dentastixItem.sizeQty}`);
}
if (dentastixItem.sizeUnit !== 'oz') {
  throw new Error(`Expected sizeUnit "oz" but got ${dentastixItem.sizeUnit}`);
}
if (dentastixItem.size !== '26.7 oz') {
  throw new Error(`Expected size string "26.7 oz" but got ${dentastixItem.size}`);
}
if (dentastixItem.packCount !== 32) {
  throw new Error(`Expected packCount 32 but got ${dentastixItem.packCount}`);
}
const greeniesItem = dogTreatProducts.find(p => /Greenies/i.test(p.name));
if (!greeniesItem) {
  throw new Error('Failed to find Stop & Shop Greenies item');
}
if (Math.abs(greeniesItem.sizeQty - 7.9) > 0.0001) {
  throw new Error(`Expected sizeQty 7.9 but got ${greeniesItem.sizeQty}`);
}
if (greeniesItem.sizeUnit !== 'oz') {
  throw new Error(`Expected sizeUnit "oz" but got ${greeniesItem.sizeUnit}`);
}
if (greeniesItem.size !== '7.9 oz') {
  throw new Error(`Expected size string "7.9 oz" but got ${greeniesItem.size}`);
}
if (greeniesItem.packCount !== 30) {
  throw new Error(`Expected packCount 30 but got ${greeniesItem.packCount}`);
}

const newLayoutHtml = fs.readFileSync('test/samples/stopandshop-missing-sronly.html', 'utf8');
const newLayoutDom = new JSDOM(newLayoutHtml);
Object.defineProperty(newLayoutDom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = newLayoutDom.window.document;
global.window = newLayoutDom.window;
const missingSrProducts = scrapeStopAndShop();
const alfredoItem = missingSrProducts.find(p => /Classico/i.test(p.name));
if (!alfredoItem) {
  throw new Error('Failed to find Stop & Shop Classico sauce item');
}
if (alfredoItem.price !== '$2.50') {
  throw new Error(`Expected price "$2.50" but got ${alfredoItem.price}`);
}
const flourItem = missingSrProducts.find(p => /Gold Medal/i.test(p.name));
if (!flourItem) {
  throw new Error('Failed to find Stop & Shop Gold Medal flour item');
}
if (flourItem.size !== '5 lb') {
  throw new Error(`Expected size string "5 lb" but got ${flourItem.size}`);
}
const raguItem = missingSrProducts.find(p => /RAGU Classic Alfredo/i.test(p.name));
if (!raguItem) {
  throw new Error('Failed to find Stop & Shop RAGU Alfredo item');
}
if (raguItem.price !== '$4.49') {
  throw new Error(`Expected price "$4.49" but got ${raguItem.price}`);
}
if (Math.abs(raguItem.priceNumber - 4.49) > 0.001) {
  throw new Error(`Expected priceNumber 4.49 but got ${raguItem.priceNumber}`);
}

// Walmart fl. oz parsing
const snippetHtml = `
<div data-testid="list-view">
  <div>
    <div data-automation-id="product-title">Test Oil 12 fl. oz</div>
    <div data-automation-id="product-price">$1.20</div>
    <div data-testid="product-price-per-unit">$0.10/fl. oz</div>
    <img data-testid="productTileImage" src="test.jpg" />
    <a href="/ip/test"></a>
  </div>
</div>`;
const snippetDom = new JSDOM(snippetHtml);
Object.defineProperty(snippetDom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = snippetDom.window.document;
global.window = snippetDom.window;
const { scrapeWalmart: scrapeWalmartSnippet } = await import('../scrapers/walmart.js');
const snippetProducts = scrapeWalmartSnippet();
const snippetItem = snippetProducts[0];
if (!snippetItem || snippetItem.unitType !== 'oz' || Math.abs(snippetItem.pricePerUnit - 0.1) > 0.0001) {
  throw new Error('Failed to parse fl. oz unit');
}

// Walmart cents per fl. oz without size in name
const snippetHtml2 = `
<div data-testid="list-view">
  <div>
    <div data-automation-id="product-title">Test Oil</div>
    <div data-automation-id="product-price">$1.44</div>
    <div data-testid="product-price-per-unit">12.0 ¢/fl oz</div>
    <img data-testid="productTileImage" src="test.jpg" />
    <a href="/ip/test"></a>
  </div>
</div>`;
const snippetDom2 = new JSDOM(snippetHtml2);
Object.defineProperty(snippetDom2.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = snippetDom2.window.document;
global.window = snippetDom2.window;
const snippetProducts2 = scrapeWalmartSnippet();
const snippetItem2 = snippetProducts2[0];
if (!snippetItem2 || snippetItem2.unitType !== 'oz' || snippetItem2.unitQty !== 1 || Math.abs(snippetItem2.pricePerUnit - 0.12) > 0.0001) {
  throw new Error('Failed to parse cents per fl. oz unit');
}

// Walmart split price markup
const snippetHtml3 = `
<div data-testid="list-view">
  <div>
    <div data-automation-id="product-title">Split Price Item</div>
    <div data-automation-id="product-price">
      <span data-automation-id="price-characteristic">6</span>
      <span data-automation-id="price-mantissa">48</span>
    </div>
    <div data-testid="product-price-per-unit">$1.00/lb</div>
    <img data-testid="productTileImage" src="test.jpg" />
    <a href="/ip/test"></a>
  </div>
</div>`;
const snippetDom3 = new JSDOM(snippetHtml3);
Object.defineProperty(snippetDom3.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = snippetDom3.window.document;
global.window = snippetDom3.window;
const snippetProducts3 = scrapeWalmartSnippet();
const snippetItem3 = snippetProducts3[0];
if (
  !snippetItem3 ||
  Math.abs(snippetItem3.priceNumber - 6.48) > 0.001 ||
  snippetItem3.price !== '$6.48'
) {
  throw new Error('Failed to parse split price markup');
}

// Shaws Dentastix parsing
const dentHtml = fs.readFileSync('test/samples/shaws-dentastixs.html', 'utf8');
const dentDom = new JSDOM(dentHtml);
Object.defineProperty(dentDom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = dentDom.window.document;
global.window = dentDom.window;
const { scrapeShaws } = await import('../scrapers/shaws.js');
const dentProducts = scrapeShaws();
const dentItem = dentProducts.find(p => /Dentastix/i.test(p.name));
if (!dentItem) throw new Error('Failed to find Dentastix item');
console.log('dentastixPrice', dentItem.pricePerUnit.toFixed(3));
if (dentItem.unitType !== 'oz') {
  throw new Error(`Expected unitType oz but got ${dentItem.unitType}`);
}
if (Math.abs(dentItem.pricePerUnit - 0.71) > 0.001) {
  throw new Error(`Expected price per oz around 0.71 but got ${dentItem.pricePerUnit}`);
}

function baseGetPackInfo(product) {
  if (product && product.packCount && product.packCount > 1) {
    return { count: product.packCount, weightPerPack: false };
  }
  const sanitize = str =>
    str?.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
  const matchPack = str => {
    if (!str) return null;
    const s = sanitize(str);
    let m;
    if ((m = s.match(/(\d+)\s*\/\s*(\d+)\s*(?:doz|dozen)/i))) {
      const numerator = parseInt(m[1], 10);
      const denominator = parseInt(m[2], 10);
      if (denominator) {
        return { count: Math.round((numerator / denominator) * 12), match: m[0] };
      }
    }
    if (!s.includes('/') && (m = s.match(/(\d+(?:\.\d+)?)\s*(?:doz|dozen)/i))) {
      return { count: Math.round(parseFloat(m[1]) * 12), match: m[0] };
    }
    if ((m = s.match(/(?:half|1\/2)\s*-?\s*doz(?:en)?/i))) {
      return { count: 6, match: m[0] };
    }
    if ((m = s.match(/\bdoz(?:en)?\b/i))) {
      return { count: 12, match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/pack\s*of\s*(\d+)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    if ((m = s.match(/(\d+)\s*-\s*\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i))) {
      return { count: parseInt(m[1], 10), match: m[0] };
    }
    return null;
  };
  let m = matchPack(product?.name);
  if (!m) m = matchPack(product?.size);
  if (!m) m = matchPack(product?.unit);
  if (m) {
    const { count, match } = m;
    const source = `${product?.name || ''} ${product?.size || ''} ${product?.unit || ''}`;
    const hasWeight = /(\d+(?:\.\d+)?)\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i.test(source);
    const isRange = /[-x\u00d7]/.test(match);
    const weightPerPack = hasWeight && !isRange;
    return { count, weightPerPack };
  }
  return { count: 1, weightPerPack: false };
}

const packInfo = baseGetPackInfo(dentItem);
if (packInfo.count !== 32) {
  throw new Error(`Expected pack count 32 but got ${packInfo.count}`);
}

const dozenProduct = { name: 'Large Eggs', unit: '1 DOZ', priceNumber: 5.49 };
const dozenInfo = baseGetPackInfo(dozenProduct);
if (dozenInfo.count !== 12) {
  throw new Error('Dozen pack detection failed');
}

const fractionalDozenProduct = { name: 'Large Eggs', size: '1.5 doz', priceNumber: 8.19 };
const fractionalDozenInfo = baseGetPackInfo(fractionalDozenProduct);
if (fractionalDozenInfo.count !== 18) {
  throw new Error(`Fractional dozen detection failed: expected 18 but got ${fractionalDozenInfo.count}`);
}

needsData.push({ name: 'Egg', home_unit: 'each' });
const perEgg = pricePerHomeUnit('Egg', fractionalDozenProduct);
const expectedPerEgg = fractionalDozenProduct.priceNumber / 18;
if (perEgg == null || Math.abs(perEgg - expectedPerEgg) > 0.0001) {
  throw new Error(`Expected per-egg price ${expectedPerEgg.toFixed(4)} but got ${perEgg}`);
}

const halfDozenProduct = { name: 'Medium Eggs', size: '1/2 doz', priceNumber: 6.29 };
const halfDozenInfo = baseGetPackInfo(halfDozenProduct);
if (halfDozenInfo.count !== 6) {
  throw new Error(`Half dozen detection failed: expected 6 but got ${halfDozenInfo.count}`);
}

const perHalfEgg = pricePerHomeUnit('Egg', halfDozenProduct);
const expectedHalfPerEgg = halfDozenProduct.priceNumber / 6;
if (perHalfEgg == null || Math.abs(perHalfEgg - expectedHalfPerEgg) > 0.0001) {
  throw new Error(`Expected per-egg price ${expectedHalfPerEgg.toFixed(4)} but got ${perHalfEgg}`);
}

needsData.push({ name: 'Pork Chops', home_unit: 'each', averageEachWeight: { gramsPerEach: 110 } });
const porkProduct = { name: 'Boneless Pork Chops', sizeQty: 24, sizeUnit: 'oz', priceNumber: 12 };
const porkEachPrice = pricePerHomeUnit('Pork Chops', porkProduct);
const porkCount = convert(porkProduct.sizeQty, porkProduct.sizeUnit, 'g') / 110;
const expectedPorkPrice = porkProduct.priceNumber / porkCount;
if (porkEachPrice == null || Math.abs(porkEachPrice - expectedPorkPrice) > 0.0001) {
  throw new Error(`Expected pork chop price ${expectedPorkPrice.toFixed(4)} but got ${porkEachPrice}`);
}

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
  const regex = /([\d.]+)\s*(fl\s*oz|oz|lb|kg|ml|l|gal|g|qt|pt|cup|tbsp|tsp|ea|ct|count)/gi;
  for (const m of normalized.matchAll(regex)) {
    let unit = m[2].toLowerCase().replace(/\s+/g, '');
    if (unit === 'floz') unit = 'oz';
    else if (unit === 'count') unit = 'ct';
    unit = UNIT_ALIASES[unit] || unit;
    return [parseFloat(m[1]), unit];
  }
  return [null, null];
}

const [qty, unit] = extractSize('32-1.66 Lbs');
const UNIT_FACTORS = { oz: 1, lb: 16 };
const converted = qty * UNIT_FACTORS[unit];
if (Math.abs(converted - 26.56) > 0.001) {
  throw new Error(`Expected converted qty 26.56 but got ${converted}`);
}
const price = 18.99;
const ppu = price / converted;
if (Math.abs(ppu - 0.715) > 0.001) {
  throw new Error(`Expected price per oz about 0.715 but got ${ppu}`);
}

// Hannaford quart unit normalization
const hannHtml = fs.readFileSync('test/samples/hannaford-pepsi.html', 'utf8');
const hannDom = new JSDOM(hannHtml);
Object.defineProperty(hannDom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = hannDom.window.document;
global.window = hannDom.window;
const { scrapeHannaford } = await import('../scrapers/hannaford.js');
const hannProducts = scrapeHannaford();
const quartItem = hannProducts.find(
  p => /Pepsi Zero Sugar/i.test(p.name) && p.sizeUnit === 'l' && Math.abs(p.sizeQty - 2) < 0.01
);
if (!quartItem) throw new Error('Failed to find Hannaford quart item');
const expectedPpu = 1.51 / 32;
const expectedRoundedPpu = roundQuantity(expectedPpu);
if (quartItem.unitType !== 'fl oz') {
  throw new Error(`Expected unitType fl oz but got ${quartItem.unitType}`);
}
if (Math.abs(quartItem.pricePerUnit - expectedRoundedPpu) > 0.0001) {
  throw new Error(`Expected price per fl oz about ${expectedRoundedPpu} but got ${quartItem.pricePerUnit}`);
}
if (quartItem.unit !== '$0.05/fl oz') {
  throw new Error(`Expected unit $0.05/fl oz but got ${quartItem.unit}`);
}

const hannHtmlNoSpace = hannHtml.replace(/Per quart/g, 'Perquart');
const hannDom2 = new JSDOM(hannHtmlNoSpace);
Object.defineProperty(hannDom2.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = hannDom2.window.document;
global.window = hannDom2.window;
const hannProducts2 = scrapeHannaford();
const quartItem2 = hannProducts2.find(
  p => /Pepsi Zero Sugar/i.test(p.name) && p.sizeUnit === 'l' && Math.abs(p.sizeQty - 2) < 0.01
);
if (!quartItem2) throw new Error('Failed to find Hannaford quart item variant');
if (quartItem2.unit !== '$0.05/fl oz') {
  throw new Error(`Perquart unit not normalized: ${quartItem2.unit}`);
}

// Amazon unit parsing snippet
const amazonHtml = `
<div data-asin="test" data-component-type="s-search-result">
  <a class="a-link-normal s-no-outline" href="/test"></a>
  <h2 class="a-size-base-plus"><span>Sample Drink 12 Fl Oz Cans (Pack of 12)</span></h2>
  <img class="s-image" src="test.jpg" />
  <span class="a-price"><span class="a-offscreen">$6.00</span></span>
  <span class="a-size-base a-color-secondary">($0.04/fl oz)</span>
  <span class="a-size-base a-color-base">12 Fl Oz Cans (Pack of 12)</span>
</div>`;
const amazonDom = new JSDOM(amazonHtml);
Object.defineProperty(amazonDom.window.HTMLElement.prototype, 'innerText', {
  get() {
    return this.textContent;
  },
  set(v) {
    this.textContent = v;
  }
});
global.document = amazonDom.window.document;
global.window = amazonDom.window;
const { scrapeAmazon } = await import('../scrapers/amazon.js');
const amazonProducts = scrapeAmazon();
const amazonItem = amazonProducts[0];
if (
  !amazonItem ||
  amazonItem.sizeQty !== 144 ||
  Math.abs(amazonItem.pricePerUnit - 0.04) > 0.0001
) {
  throw new Error('Amazon snippet parsing failed');
}

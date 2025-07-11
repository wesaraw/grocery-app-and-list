import fs from 'fs';
import { JSDOM } from 'jsdom';
const {
  parseUnitPrice,
  SHEET_SQFT,
  getPriceUnitInfo,
  sheetSqFtFor,
  UNIT_ALIASES
} = await import('../utils/priceUtils.js');

const html = fs.readFileSync("Search Results toilet paper _ Shaw's.html", 'utf8');
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

// Test pricePerHomeUnit with sheets
let needsData = [{ name: 'Bounty Paper Towels', home_unit: 'sheets' }];

function pricePerHomeUnit(itemName, product) {
  const item = needsData.find(n => n.name === itemName);
  if (!item || !product) return null;
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
const walmartHtml = fs.readFileSync('Bounty Paper Towels - Walmart.com.html', 'utf8');
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
  if (perSheetWalmart == null || Math.abs(perSheetWalmart - 0.022) > 0.001) {
    throw new Error(`Expected around 0.022 but got ${perSheetWalmart}`);
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

// Shaws Dentastix parsing
const dentHtml = fs.readFileSync("Search Results Dentastixs _ Shaw's.html", 'utf8');
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
if (Math.abs(dentItem.pricePerUnit - 0.7137) > 0.001) {
  throw new Error(`Expected price per oz around 0.714 but got ${dentItem.pricePerUnit}`);
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
    return (
      s.match(/(\d+)\s*[-\u2011\u2012\u2013\u2014]?\s*(?:pack|pk|ct|count|rolls?|rl)/i) ||
      s.match(/(\d+)(?:\s*\w+){0,3}\s*(?:rolls?|rl)/i) ||
      s.match(/pack\s*of\s*(\d+)/i) ||
      s.match(/(\d+)\s*[-x\u00d7]\s*\d+/i) ||
      s.match(/(\d+)\s*-\s*\d+(?:\.\d+)?\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i)
    );
  };
  let m = matchPack(product?.name);
  if (!m) m = matchPack(product?.size);
  if (!m) m = matchPack(product?.unit);
  if (m) {
    const count = parseInt(m[1], 10);
    const source = `${product?.name || ''} ${product?.size || ''} ${product?.unit || ''}`;
    const hasWeight = /(\d+(?:\.\d+)?)\s*(?:fl\s*oz|oz|lb|kg|g|ml|l|qt|pt|cup|tbsp|tsp|gal)/i.test(source);
    const isRange = /[-x\u00d7]/.test(m[0]);
    const weightPerPack = hasWeight && !isRange;
    return { count, weightPerPack };
  }
  return { count: 1, weightPerPack: false };
}

const packInfo = baseGetPackInfo(dentItem);
if (packInfo.count !== 32) {
  throw new Error(`Expected pack count 32 but got ${packInfo.count}`);
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

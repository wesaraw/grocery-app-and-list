import fs from 'fs';
import { JSDOM } from 'jsdom';
const { parseUnitPrice, SHEET_SQFT } = await import('../utils/priceUtils.js');

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

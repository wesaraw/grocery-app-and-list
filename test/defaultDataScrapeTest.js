import 'fake-indexeddb/auto';
import fs from 'fs';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'url';
import { db } from '../db.js';
import { loadArrayWithFallback, getItemId } from '../utils/itemRegistry.js';
import { setItemDetail, getItemDetail } from '../utils/itemDetails.js';
import { parseQuantity } from '../utils/calendarUtils.js';
import { initUomTable } from '../utils/uomConverter.js';
import { sheetSqFtFor, getPriceUnitInfo } from '../utils/priceUtils.js';

global.chrome = { runtime: { getURL: p => pathToFileURL(process.cwd() + '/' + p).href } };
global.fetch = async url => ({ json: async () => JSON.parse(fs.readFileSync(new URL(url), 'utf8')) });

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

function pricePerHomeUnitSimple(itemName, product, needs) {
  const item = needs.find(n => n.name === itemName);
  if (!item) return null;
  const unit = (item.home_unit || 'each').toLowerCase();
  const pack = product.packCount || 1;
  if (unit === 'each') {
    return product.priceNumber != null ? product.priceNumber / pack : null;
  }
  if (unit === 'sheets') {
    const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
    if (ppu != null && ut) {
      if (/ct|count|sheet/i.test(ut)) return ppu;
      if (/^(?:sf|sqft)$/i.test(ut)) return ppu * sheetSqFtFor(itemName);
    }
    return null;
  }
  return null;
}

async function mealCostSimple(itemName, amountStr, needs) {
  const { value } = parseQuantity(amountStr);
  if (!value) return null;
  const id = await getItemId(itemName);
  const prod = await getItemDetail(id);
  const pphu = pricePerHomeUnitSimple(itemName, prod, needs);
  return pphu != null ? pphu * value : null;
}

async function run() {
  await initUomTable();
  await db.items.clear();
  await db.lists.clear();
  const needs = await loadArrayWithFallback('yearlyNeeds', YEARLY_NEEDS_PATH);
  if (!needs.length) throw new Error('Needs data not loaded');
  if (!needs.some(n => n.name === 'Bounty Paper Towels')) throw new Error('Bounty needs missing');

  const tests = [
    {
      store: 'Walmart',
      file: 'test/samples/walmart-bounty.html',
      scraper: () => import('../scrapers/walmart.js').then(m => m.scrapeWalmart()),
      item: 'Bounty Paper Towels',
      expected: 0.0225,
      tol: 0.0001
    },
    {
      store: 'Amazon',
      file: 'test/samples/amazon-minute-rice.html',
      scraper: () => import('../scrapers/amazon.js').then(m => m.scrapeAmazon()),
      item: 'Minute Rice White Side Dishes',
      expected: 0.98,
      tol: 0.0001
    },
    {
      store: 'Hannaford',
      file: 'test/samples/hannaford-pepsi.html',
      scraper: () => import('../scrapers/hannaford.js').then(m => m.scrapeHannaford()),
      item: 'Pepsi Soda Zero Beverages',
      expected: 3.19,
      tol: 0.001
    },
    {
      store: 'Shaws',
      file: 'test/samples/shaws-pepsi.html',
      scraper: () => import('../scrapers/shaws.js').then(m => m.scrapeShaws()),
      item: 'Pepsi Soda Zero Beverages',
      expected: 10.99 / 12,
      tol: 0.001
    },
    {
      store: 'Stop & Shop',
      file: 'test/samples/stopandshop-pepsi.html',
      scraper: () => import('../scrapers/stopandshop.js').then(m => m.scrapeStopAndShop()),
      item: 'Pepsi Soda Zero Beverages',
      expected: 3.49,
      tol: 0.001
    },
    {
      store: 'Roche Bros',
      file: 'test/samples/rochebros-pepsi.html',
      scraper: () => import('../scrapers/rochebros.js').then(m => m.scrapeRocheBros()),
      item: 'Pepsi Soda Zero Beverages',
      expected: 2.99,
      tol: 0.001
    }
  ];

  for (const t of tests) {
    const html = fs.readFileSync(t.file, 'utf8');
    const dom = new JSDOM(html);
    Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
      get() {
        return this.textContent;
      },
      set(v) {
        this.textContent = v;
      }
    });
    global.document = dom.window.document;
    global.window = dom.window;
    const products = await t.scraper();
    const prod = products[0];
    const price = pricePerHomeUnitSimple(t.item, prod, needs);
    if (price == null || Math.abs(price - t.expected) > t.tol) {
      throw new Error(`${t.store} expected ${t.expected} got ${price}`);
    }
    const id = await getItemId(t.item);
    await setItemDetail(id, { ...prod, selectedStore: t.store });
    const unit = needs.find(n => n.name === t.item)?.home_unit || 'each';
    const mealPrice = await mealCostSimple(t.item, `1 ${unit}`, needs);
    if (mealPrice == null || Math.abs(mealPrice - t.expected) > t.tol) {
      throw new Error(`${t.store} meal price expected ${t.expected} got ${mealPrice}`);
    }
  }

  const stored = await db.lists.get('yearlyNeeds');
  if (!stored || !Array.isArray(stored.value) || stored.value.length === 0) {
    throw new Error('Needs not persisted');
  }

  console.log('default data scrape tests passed');
}

await run();

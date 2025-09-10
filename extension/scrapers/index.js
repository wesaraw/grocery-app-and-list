import { scrape } from './generated/index.js';
import { get as storageGet, set as storageSet } from '../storageService.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'triggerScrape') return;
  const store = message.store || '';
  const itemId = message.item;
  const storeId = store.toLowerCase().replace(/\s+/g, '-');
  const products = scrape(storeId, document);
  if (itemId) {
    storageGet('items', []).then(items => {
      const idx = items.findIndex(i => i.id === itemId || i.name === itemId);
      if (idx !== -1) {
        const it = items[idx];
        const scraped = Array.isArray(it.options?.scraped) ? it.options.scraped : [];
        scraped.push({ store, products, scrapedAt: Date.now(), version: 1 });
        items[idx] = { ...it, options: { ...it.options, scraped } };
        storageSet('items', items);
      }
    });
  }
  sendResponse({ count: products.length });
});

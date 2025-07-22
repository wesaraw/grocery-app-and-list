import { scrapeStopAndShop } from './utils/scrapers/stopandshop.js';
import { scrapeWalmart } from './utils/scrapers/walmart.js';
import { scrapeAmazon } from './utils/scrapers/amazon.js';
import { scrapeShaws } from './utils/scrapers/shaws.js';
import { scrapeRocheBros } from './utils/scrapers/rochebros.js';
import { scrapeHannaford } from './utils/scrapers/hannaford.js';

console.log('✅ contentScript.js loaded on page:', window.location.href);

const SCRAPERS = {
  'stopandshop.com': scrapeStopAndShop,
  'www.walmart.com': scrapeWalmart,
  'www.amazon.com': scrapeAmazon,
  'www.shaws.com': scrapeShaws,
  'onlineshopping.rochebros.com': scrapeRocheBros,
  'www.hannaford.com': scrapeHannaford
};

function getScraper() {
  const host = location.hostname;
  if (SCRAPERS[host]) return SCRAPERS[host];
  for (const [domain, fn] of Object.entries(SCRAPERS)) {
    if (host.endsWith(domain)) return fn;
  }
  return null;
}

function runScrape(attempt = 0) {
  chrome.storage.local.get('currentItemInfo', info => {
    const { item = '' } = info.currentItemInfo || {};
    const scraper = getScraper();
    const data = scraper ? scraper() : [];
    if (!data.length && attempt < 5) {
      setTimeout(() => runScrape(attempt + 1), 1000);
      return;
    }
    chrome.runtime.sendMessage({ type: 'scrapedData', item, products: data });
  });
}

setTimeout(runScrape, 1000);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'triggerScrape') {
    runScrape();
  } else if (message.type === 'simulateClick' && message.selector) {
    const el = document.querySelector(message.selector);
    if (el) el.click();
  }
});

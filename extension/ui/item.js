import { get as storageGet } from '../storageService.js';

const STORE_SEARCH_BASE = {
  'Stop & Shop': 'https://stopandshop.com/product-search/',
  Walmart: 'https://www.walmart.com/search?q=',
  Amazon: 'https://www.amazon.com/s?k=',
  Shaws: 'https://www.shaws.com/shop/search-results.html?q=',
  'Roche Bros': 'https://shopping.rochebros.com/search?search_term=',
  Hannaford: 'https://www.hannaford.com/search/product?keyword='
};

const storeTabs = new Map();
const storeInfo = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const itemParam = params.get('item') || '';
  const backBtn = document.getElementById('back');
  backBtn.addEventListener('click', () => window.close());

  const items = await storageGet('items');
  const stores = await storageGet('stores', []);
  const item = items.find(it => it.id === itemParam || it.name === itemParam);
  const itemName = item?.name || itemParam;
  document.getElementById('itemName').textContent = itemName;

  const storeList = stores.length ? stores.map(s => s.name) : Object.keys(STORE_SEARCH_BASE);
  const container = document.getElementById('stores');

  storeList.forEach(name => {
    const div = document.createElement('div');
    div.className = 'store';

    const header = document.createElement('div');
    const openBtn = document.createElement('button');
    openBtn.textContent = name;
    openBtn.addEventListener('click', () => {
      const base = STORE_SEARCH_BASE[name] || '';
      const url = base + encodeURIComponent(itemName);
      chrome.runtime.sendMessage(
        { type: 'openStoreTab', url, item: itemParam, store: name },
        resp => {
          if (resp && resp.tabId) storeTabs.set(name, resp.tabId);
        }
      );
    });
    header.appendChild(openBtn);

    const scrapeBtn = document.createElement('button');
    scrapeBtn.textContent = 'Scrape';
    scrapeBtn.addEventListener('click', () => {
      const tabId = storeTabs.get(name);
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: 'triggerScrape', item: itemParam, store: name });
      }
      const path = `scrapeResults.html?item=${encodeURIComponent(itemParam)}&store=${encodeURIComponent(name)}`;
      setTimeout(() => {
        window.open(path, '_blank');
      }, 1000);
    });
    header.appendChild(scrapeBtn);

    const info = document.createElement('div');
    info.textContent = 'No selection';
    div.appendChild(header);
    div.appendChild(info);
    container.appendChild(div);
    storeInfo.set(name, info);
  });

  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'finalSelection' && message.item === itemParam) {
      const info = storeInfo.get(message.store);
      if (info) {
        const prod = message.product || {};
        const price = prod.priceNumber != null ? `$${prod.priceNumber.toFixed(2)}` : prod.price || '';
        info.textContent = [prod.name, price].filter(Boolean).join(' - ');
      }
    }
  });
});

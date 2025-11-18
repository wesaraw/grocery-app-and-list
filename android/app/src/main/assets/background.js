const SCRAPED_PREFIX = 'scraped_';
const SCRAPED_FIELDS = [
  'name',
  'image',
  'price',
  'priceNumber',
  'pricePerUnit',
  'unit',
  'unitType',
  'size',
  'sizeQty',
  'sizeUnit',
  'convertedQty',
  'packCount',
  'link',
  'addToCartId'
];
const SCRAPED_MAX_RESULTS = 20;
const SCRAPED_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function sanitizeProduct(product) {
  if (!product || typeof product !== 'object') return {};
  const sanitized = {};
  for (const field of SCRAPED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(product, field) && product[field] != null) {
      sanitized[field] = product[field];
    }
  }
  return sanitized;
}

function serializeProducts(products) {
  if (!Array.isArray(products)) return [];
  return products
    .slice(0, SCRAPED_MAX_RESULTS)
    .map(sanitizeProduct)
    .filter(entry => Object.keys(entry).length > 0);
}

function cleanupScrapedKeys() {
  chrome.storage.local.get(null, data => {
    if (!data) return;
    const now = Date.now();
    const toRemove = [];
    Object.entries(data).forEach(([key, value]) => {
      if (!key.startsWith(SCRAPED_PREFIX)) return;
      if (!value || typeof value !== 'object') {
        toRemove.push(key);
        return;
      }
      const savedAt = typeof value.savedAt === 'number' ? value.savedAt : 0;
      const products = Array.isArray(value.products) ? value.products : null;
      if (!products || !savedAt || now - savedAt > SCRAPED_TTL_MS) {
        toRemove.push(key);
      }
    });
    if (toRemove.length > 0) {
      chrome.storage.local.remove(toRemove);
    }
  });
}

cleanupScrapedKeys();
if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(cleanupScrapedKeys);
}
if (chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(cleanupScrapedKeys);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'openStoreTab') {
    const { url, item, store } = message;
    chrome.tabs.create({ url }, tab => {
      chrome.storage.local.set({ currentItemInfo: { item, store, tabId: tab.id } }, () => {
        sendResponse({ tabId: tab.id });
      });
    });
    return true; // indicate async response
  } else if (message.type === 'scrapedData') {
    const key = `${SCRAPED_PREFIX}${encodeURIComponent(message.item)}_${encodeURIComponent(message.store)}`;
    const products = serializeProducts(message.products || []);
    const payload = { savedAt: Date.now(), products };
    chrome.storage.local.set({ [key]: payload });
  }
});

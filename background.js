import { getItemId } from './utils/itemRegistry.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'openStoreTab') {
    const { url, item, store } = message;
    (async () => {
      const itemId = await getItemId(item);
      chrome.tabs.create({ url }, tab => {
        chrome.storage.local.set(
          { currentItemInfo: { itemId, store, tabId: tab.id } },
          () => {
            sendResponse({ tabId: tab.id });
          }
        );
      });
    })();
    return true; // indicate async response
  } else if (message.type === 'scrapedData') {
    const key = `scraped_${encodeURIComponent(message.itemId)}_${encodeURIComponent(
      message.store
    )}`;
    chrome.storage.local.set({ [key]: message.products });
  }
});

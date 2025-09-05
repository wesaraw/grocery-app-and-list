import { createItemList, createPriceEntry } from './components.js';

// Load committed items from storage. Mirrors v1 helper in
// `Version Old/shoppingList.js`.
function loadCommitItems() {
  return new Promise(resolve => {
    chrome.storage.local.get('lastCommitItems', data => {
      resolve(data.lastCommitItems || []);
    });
  });
}

// Simplified purchase helpers; the legacy implementation performed
// name↔ID conversions (see `Version Old/utils/purchaseStorage.js`).
function loadPurchases() {
  return new Promise(resolve => {
    chrome.storage.local.get('purchases', data => resolve(data.purchases || {}));
  });
}

function savePurchases(purchases) {
  return new Promise(resolve => {
    chrome.storage.local.set({ purchases }, () => resolve());
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const listHost = document.getElementById('list');
  const search = document.getElementById('searchBox');
  const confirmBtn = document.getElementById('confirmAdd');

  const items = await loadCommitItems();
  if (items.length === 0) {
    listHost.textContent = 'No items committed.';
    return;
  }

  const itemList = createItemList();
  // Group by store to mimic the legacy commit window (see
  // `Version Old/shoppingList.js` lines 27-107).
  itemList.render(items, { groupBy: 'store' });
  listHost.appendChild(itemList);

  const priceEntry = createPriceEntry();
  listHost.appendChild(priceEntry);

  // When a row is clicked, open the product's store page and expose price/pack
  // inputs for adjustments.
  itemList.addEventListener('item-selected', e => {
    const it = e.detail;
    priceEntry.render(it);
    if (it.product?.link) {
      chrome.runtime.sendMessage({
        type: 'openStoreTab',
        url: it.product.link,
        item: it.item,
        store: it.store
      });
    }
  });

  if (search) {
    search.addEventListener('input', () => {
      const text = search.value.trim().toLowerCase();
      const filtered = items.filter(it => it.item.toLowerCase().includes(text));
      itemList.render(filtered, { groupBy: 'store' });
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      // Based on `Version Old/shoppingList.js` lines 121-145.
      const purchases = await loadPurchases();
      const data = await new Promise(resolve =>
        chrome.storage.local.get(['lastCommitItems', 'pendingCommitWeek'], resolve)
      );
      const { lastCommitItems = [], pendingCommitWeek } = data;
      if (pendingCommitWeek == null) {
        window.close();
        return;
      }
      for (const it of lastCommitItems) {
        (purchases[it.item] ||= []).push({
          purchase_week: pendingCommitWeek,
          quantity_purchased: it.amount
        });
      }
      await savePurchases(purchases);
      chrome.storage.local.remove('pendingCommitWeek', () => window.close());
    });
  }
});

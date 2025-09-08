import { createItemList, createPriceEntry } from './components.js';
import { get as storageGet } from '../../src/services/storageService.js';
import { applyCoupon, findCoupon } from '../utils/coupon.js';

let hideZeroItems = false;

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
  const toggleZero = document.getElementById('toggleZero');
  const confirmBtn = document.getElementById('confirmAdd');

  const [commitItems, allItems, coupons, weekData] = await Promise.all([
    loadCommitItems(),
    storageGet('items'),
    storageGet('coupons'),
    new Promise(resolve => chrome.storage.local.get('pendingCommitWeek', resolve))
  ]);
  const pendingWeek = weekData.pendingCommitWeek ?? 0;

  if (commitItems.length === 0) {
    listHost.textContent = 'No items committed.';
    return;
  }

  const itemList = createItemList();
  // Group by store to mimic the legacy commit window (see
  // `Version Old/shoppingList.js` lines 27-107).
  listHost.appendChild(itemList);

  const priceEntry = createPriceEntry();
  listHost.appendChild(priceEntry);

  function renderList() {
    const text = search?.value.trim().toLowerCase() || '';
    const filtered = commitItems.filter(it => {
      const matchesSearch = (it.item || it.name || '')
        .toLowerCase()
        .includes(text);
      const nonZero = !hideZeroItems || it.amount > 0;
      return matchesSearch && nonZero;
    });
    itemList.render(filtered, { groupBy: 'store' });
  }

  renderList();

  // When a row is clicked, expose price/pack inputs for adjustments.
  itemList.addEventListener('item-selected', e => {
    const it = e.detail;
    priceEntry.render(it);
  });

  priceEntry.addEventListener('price-changed', e => {
    const { item, value } = e.detail;
    const name = item.item || item.name;
    const match = allItems.find(i => i.name === name);
    const coupon = match && findCoupon(coupons, match.id, item.store, pendingWeek);
    const final = applyCoupon(value, coupon);
    if (typeof priceEntry.setFinalPrice === 'function') priceEntry.setFinalPrice(final);
  });

  if (search) {
    search.addEventListener('input', renderList);
  }

  if (toggleZero) {
    toggleZero.addEventListener('click', () => {
      hideZeroItems = !hideZeroItems;
      toggleZero.textContent = hideZeroItems ? 'Show Zero Qty' : 'Hide Zero Qty';
      renderList();
    });
    toggleZero.textContent = 'Hide Zero Qty';
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

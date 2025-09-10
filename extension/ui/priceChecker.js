import { get as storageGet, set as storageSet } from '../storageService.js';
import { sortItemsByCategory } from './components.js';

const commitMap = new Map();
let items = [];
let listEl;
let searchBox;
let toggleZeroBtn;
let hideZero = false;
const headerState = {};

function saveCommit() {
  storageSet('lastCommitItems', Array.from(commitMap.values()));
}

function render() {
  const query = (searchBox.value || '').toLowerCase();
  const filtered = sortItemsByCategory(items)
    .filter(it => (it.name || '').toLowerCase().includes(query))
    .filter(it => {
      const key = it.id || it.name;
      const entry = commitMap.get(key);
      const amount = entry?.amount ?? 0;
      return !hideZero || amount > 0;
    })
    .map(it => {
      const key = it.id || it.name;
      const entry = commitMap.get(key);
      return {
        ...it,
        quantity: entry?.amount ?? 0,
        store: entry?.store,
        product: entry?.product
      };
    });

  listEl.render(filtered, { groupBy: 'category', headerState });

  filtered.forEach(it => {
    const key = it.id || it.name;
    const entry = commitMap.get(key);
    const row = listEl.querySelector(`[data-item-id="${key}"]`);
    if (!row || !entry?.product) return;
    const price =
      entry.product.priceNumber != null
        ? `$${entry.product.priceNumber.toFixed(2)}`
        : entry.product.price || '';
    const unit =
      entry.product.pricePerUnit != null
        ? `$${entry.product.pricePerUnit.toFixed(2)}/${
            entry.product.unitType || ''
          }`
        : entry.product.unit || '';
    const pack =
      entry.product.convertedQty != null
        ? `${entry.product.convertedQty}${
            entry.product.unitType ? ' ' + entry.product.unitType : ''
          }`
        : entry.product.size || '';
    const info = document.createElement('span');
    info.textContent = [price, unit, pack].filter(Boolean).join(' | ');
    row.insertBefore(info, row.querySelector('input'));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  listEl = document.getElementById('items');
  searchBox = document.getElementById('searchBox');
  toggleZeroBtn = document.getElementById('toggleZero');
  const storeTotalsBtn = document.getElementById('storeTotalsBtn');

  const [storedItems, commitItems] = await Promise.all([
    storageGet('items', []),
    storageGet('lastCommitItems', [])
  ]);
  items = storedItems;
  commitItems.forEach(entry => commitMap.set(entry.item, entry));

  searchBox.addEventListener('input', render);
  toggleZeroBtn.addEventListener('click', () => {
    hideZero = !hideZero;
    toggleZeroBtn.textContent = hideZero ? 'Show Zero Qty' : 'Hide Zero Qty';
    render();
  });
  toggleZeroBtn.textContent = 'Hide Zero Qty';

  storeTotalsBtn.addEventListener('click', () => {
    window.open('storeTotals.html', '_blank');
  });

  listEl.addEventListener('item-updated', e => {
    const { item, value } = e.detail;
    const key = item.id || item.name;
    const entry = commitMap.get(key) || { item: key };
    entry.amount = value;
    commitMap.set(key, entry);
    saveCommit();
    if (hideZero) render();
  });

  listEl.addEventListener('item-selected', e => {
    const it = e.detail;
    const key = it.id || it.name;
    const path = `item.html?item=${encodeURIComponent(key)}`;
    window.open(path, '_blank');
  });

  render();
});

chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'finalSelection') {
    const key = message.item;
    const entry = commitMap.get(key) || { item: key, amount: 0 };
    entry.store = message.store;
    entry.product = message.product;
    commitMap.set(key, entry);
    saveCommit();
    render();
  }
});

import { get as storageGet } from '../storageService.js';

export function computeStoreTotals(items = []) {
  const totals = {};
  for (const item of items) {
    const store = item.options?.finalStore;
    const product = item.options?.selected;
    if (!store || !product) continue;
    const unitPrice = product.pricePerUnit ?? product.priceNumber ?? 0;
    const qty = item.toBuy ?? 0;
    const monthlyQty = item.monthly ?? 0;
    const purchase = unitPrice * qty;
    const monthly = unitPrice * monthlyQty;
    if (!totals[store]) {
      totals[store] = { purchase: 0, monthly: 0, items: [] };
    }
    totals[store].purchase += purchase;
    totals[store].monthly += monthly;
    totals[store].items.push({ name: item.name, purchase, monthly });
  }
  return totals;
}

async function renderTotals() {
  const items = await storageGet('items', []);
  const totals = computeStoreTotals(items);
  const host = document.getElementById('totals');
  Object.entries(totals).forEach(([store, data]) => {
    const header = document.createElement('div');
    header.className = 'store-header';
    header.textContent = `${store} - Purchase: $${data.purchase.toFixed(2)} - Monthly: $${data.monthly.toFixed(2)}`;
    const ul = document.createElement('ul');
    ul.className = 'item-list';
    ul.style.display = 'none';
    data.items.forEach(it => {
      const li = document.createElement('li');
      const monthlyStr = it.monthly ? `, Monthly: $${it.monthly.toFixed(2)}` : '';
      li.textContent = `${it.name}: $${it.purchase.toFixed(2)}${monthlyStr}`;
      ul.appendChild(li);
    });
    header.addEventListener('click', () => {
      ul.style.display = ul.style.display === 'none' ? 'block' : 'none';
    });
    host.appendChild(header);
    host.appendChild(ul);
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', renderTotals);
}

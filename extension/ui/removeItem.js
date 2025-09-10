import { get as storageGet, set as storageSet, remove as storageRemove } from '../storageService.js';

export async function removeItem(itemId) {
  const items = await storageGet('items');
  const remainingItems = items.filter(it => it.id !== itemId);
  if (remainingItems.length > 0) {
    await storageSet('items', remainingItems);
  } else {
    await storageRemove('items');
  }

  const products = await storageGet('store-products', []);
  const remainingProducts = (products || []).filter(p => p.itemId !== itemId);
  if (remainingProducts.length > 0) {
    await storageSet('store-products', remainingProducts);
  } else if (products && products.length) {
    await storageRemove('store-products');
  }
}

async function populateItems() {
  const items = await storageGet('items');
  const select = document.getElementById('item-select');
  items.forEach(it => {
    const option = document.createElement('option');
    option.value = it.id;
    option.textContent = it.name;
    select.appendChild(option);
  });
}

if (typeof document !== 'undefined') {
  populateItems();
  document.getElementById('confirm').addEventListener('click', async () => {
    const select = document.getElementById('item-select');
    const id = select.value;
    if (!id) return;
    await removeItem(id);
    window.close();
  });
  document.getElementById('cancel').addEventListener('click', () => window.close());
}

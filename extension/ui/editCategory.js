import { get as storageGet, updateItemById } from '../../src/services/storageService.js';

const CURRENT = 1;

async function populate() {
  const items = await storageGet('items', []);
  const itemSelect = document.getElementById('item-select');
  const categorySelect = document.getElementById('category-select');
  const categories = new Set();
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    itemSelect.appendChild(opt);
    if (item.category) categories.add(item.category);
  });
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });
}

export async function updateCategory(id, category) {
  await updateItemById('items', id, { category, version: CURRENT });
}

if (typeof document !== 'undefined') {
  populate();
  document.getElementById('save').addEventListener('click', async () => {
    const id = document.getElementById('item-select').value;
    const category = document.getElementById('category-select').value;
    if (!id) return;
    await updateCategory(id, category);
    window.close();
  });
  document.getElementById('cancel').addEventListener('click', () => window.close());
}

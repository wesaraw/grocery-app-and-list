import { get as storageGet, updateItemById } from '../services/storageService.js';

const CURRENT = 1;

async function populate() {
  const items = await storageGet('items', []);
  const select = document.getElementById('item-select');
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    select.appendChild(opt);
  });
}

export async function renameItem(id, newName) {
  await updateItemById('items', id, { name: newName, version: CURRENT });
}

if (typeof document !== 'undefined') {
  populate();
  document.getElementById('save').addEventListener('click', async () => {
    const id = document.getElementById('item-select').value;
    const newName = document.getElementById('name-input').value.trim();
    if (!id || !newName) return;
    await renameItem(id, newName);
    window.close();
  });
  document.getElementById('cancel').addEventListener('click', () => window.close());
}

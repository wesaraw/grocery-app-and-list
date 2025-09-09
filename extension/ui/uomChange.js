import { get as storageGet, updateItemById } from '../services/storageService.js';
import { unitNormalize } from '../utils/units.js';

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

export async function changeUom(id, uom) {
  const normalized = unitNormalize(uom);
  await updateItemById('items', id, { uom: normalized, unit: normalized, version: CURRENT });
}

if (typeof document !== 'undefined') {
  populate();
  document.getElementById('save').addEventListener('click', async () => {
    const id = document.getElementById('item-select').value;
    const uom = document.getElementById('uom-input').value.trim();
    if (!id || !uom) return;
    await changeUom(id, uom);
    window.close();
  });
  document.getElementById('cancel').addEventListener('click', () => window.close());
}

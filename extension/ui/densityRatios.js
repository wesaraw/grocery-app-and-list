import { get as storageGet, updateItemById } from '../storageService.js';

const CURRENT = 1;

async function populate() {
  const items = await storageGet('items', []);
  const table = document.getElementById('ratio-table');
  items.forEach(item => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = item.name;
    const inputCell = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    if (typeof item.volumeWeightRatio === 'number') {
      input.value = item.volumeWeightRatio;
    }
    input.dataset.id = item.id;
    inputCell.appendChild(input);
    row.appendChild(nameCell);
    row.appendChild(inputCell);
    table.appendChild(row);
  });
}

export async function updateRatio(id, ratio) {
  await updateItemById('items', id, { volumeWeightRatio: ratio, version: CURRENT });
}

if (typeof document !== 'undefined') {
  populate();
  document.getElementById('save').addEventListener('click', async () => {
    const inputs = document.querySelectorAll('#ratio-table input');
    for (const input of inputs) {
      const id = input.dataset.id;
      const ratio = parseFloat(input.value);
      if (!id || !Number.isFinite(ratio)) continue;
      await updateRatio(id, ratio);
    }
    window.close();
  });
  document.getElementById('cancel').addEventListener('click', () => window.close());
}

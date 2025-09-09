import { get as storageGet, updateItemById } from '../services/storageService.js';

const CURRENT = 1;

function addRow(start = '', end = '') {
  const tbody = document.querySelector('#season-table tbody');
  const tr = document.createElement('tr');

  const startTd = document.createElement('td');
  const startInput = document.createElement('input');
  startInput.type = 'number';
  startInput.value = start;
  startTd.appendChild(startInput);

  const endTd = document.createElement('td');
  const endInput = document.createElement('input');
  endInput.type = 'number';
  endInput.value = end;
  endTd.appendChild(endInput);

  const actionTd = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => tr.remove());
  actionTd.appendChild(delBtn);

  tr.append(startTd, endTd, actionTd);
  tbody.appendChild(tr);
}

async function populateItems() {
  const items = await storageGet('items', []);
  const select = document.getElementById('item-select');
  items.forEach(it => {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = it.name;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    const item = items.find(i => i.id === select.value);
    renderRanges(item);
  });
  if (items.length) {
    select.value = items[0].id;
    renderRanges(items[0]);
  }
}

function renderRanges(item) {
  const tbody = document.querySelector('#season-table tbody');
  tbody.innerHTML = '';
  const ranges = Array.isArray(item?.seasonRanges) ? item.seasonRanges : [];
  ranges.forEach(r => addRow(r.start, r.end));
}

export async function saveSeasonRanges(id, ranges) {
  await updateItemById('items', id, { seasonRanges: ranges, version: CURRENT });
}

if (typeof document !== 'undefined') {
  populateItems();
  document.getElementById('add-row').addEventListener('click', () => addRow());
  document.getElementById('save').addEventListener('click', async () => {
    const id = document.getElementById('item-select').value;
    if (!id) return;
    const rows = document.querySelectorAll('#season-table tbody tr');
    const ranges = [];
    rows.forEach(row => {
      const start = parseInt(row.children[0].querySelector('input').value, 10);
      const end = parseInt(row.children[1].querySelector('input').value, 10);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        ranges.push({ start, end });
      }
    });
    await saveSeasonRanges(id, ranges);
    window.close();
  });
  document.getElementById('cancel').addEventListener('click', () => window.close());
}

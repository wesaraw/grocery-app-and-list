import { get as storageGet, updateItemById } from '../storageService.js';

const CURRENT = 1;

function addRow(week = '', qty = '') {
  const tbody = document.querySelector('#stock-table tbody');
  const tr = document.createElement('tr');

  const weekTd = document.createElement('td');
  const weekInput = document.createElement('input');
  weekInput.type = 'number';
  weekInput.value = week;
  weekTd.appendChild(weekInput);

  const qtyTd = document.createElement('td');
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.value = qty;
  qtyTd.appendChild(qtyInput);

  const actionTd = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', () => tr.remove());
  actionTd.appendChild(delBtn);

  tr.append(weekTd, qtyTd, actionTd);
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
    renderStock(item);
  });
  if (items.length) {
    select.value = items[0].id;
    renderStock(items[0]);
  }
}

function renderStock(item) {
  const tbody = document.querySelector('#stock-table tbody');
  tbody.innerHTML = '';
  const stock = item && item.currentStockByWeek ? item.currentStockByWeek : {};
  Object.entries(stock).forEach(([w, q]) => addRow(w, q));
}

export async function saveCurrentStock(id, stock) {
  await updateItemById('items', id, { currentStockByWeek: stock, version: CURRENT });
}

if (typeof document !== 'undefined') {
  populateItems();
  document.getElementById('add-row').addEventListener('click', () => addRow());
  document.getElementById('save').addEventListener('click', async () => {
    const id = document.getElementById('item-select').value;
    if (!id) return;
    const rows = document.querySelectorAll('#stock-table tbody tr');
    const stock = {};
    rows.forEach(row => {
      const week = parseInt(row.children[0].querySelector('input').value, 10);
      const qty = parseFloat(row.children[1].querySelector('input').value);
      if (Number.isFinite(week) && Number.isFinite(qty)) {
        stock[week] = qty;
      }
    });
    await saveCurrentStock(id, stock);
    window.close();
  });
  document.getElementById('cancel').addEventListener('click', () => window.close());
}

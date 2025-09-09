import { get as storageGet } from '../services/storageService.js';

export function computeTimeline(item) {
  const stockByWeek = item.currentStockByWeek || {};
  const shelf = item.shelfLifeWeeks || 0;
  const incoming = Object.entries(stockByWeek)
    .map(([wStr, qty]) => {
      const start = parseInt(wStr, 10);
      if (!Number.isFinite(start)) return null;
      return { start, qty: Number(qty), exp: start + shelf };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
  const active = [];
  const timeline = [];
  for (let w = 1; w <= 52; w++) {
    while (incoming.length && incoming[0].start <= w) {
      active.push(incoming.shift());
    }
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i].exp <= w) active.splice(i, 1);
    }
    const qty = active.reduce((sum, b) => sum + b.qty, 0);
    timeline.push(qty);
  }
  return timeline;
}

async function render() {
  const items = await storageGet('items', []);
  const container = document.getElementById('timeline');
  container.innerHTML = '';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  const thName = document.createElement('th');
  thName.textContent = 'Item';
  header.appendChild(thName);
  for (let w = 1; w <= 52; w++) {
    const th = document.createElement('th');
    th.textContent = w;
    header.appendChild(th);
  }
  thead.appendChild(header);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  (items || []).forEach(item => {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = item.name;
    tr.appendChild(nameTd);
    const weeks = computeTimeline(item);
    weeks.forEach(qty => {
      const td = document.createElement('td');
      td.textContent = qty > 0 ? qty.toFixed(1) : '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

if (typeof document !== 'undefined') {
  document.getElementById('back').addEventListener('click', () => window.close());
  render();
}

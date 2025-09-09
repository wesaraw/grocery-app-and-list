import { get as storageGet, set as storageSet } from '../services/storageService.js';
import { renderItemsWithCategoryHeaders } from './components.js';

let items = [];
const headerState = {};

function render(list) {
  const container = document.getElementById('consumption');
  renderItemsWithCategoryHeaders(container, list, (parent, item) => {
    const total = (item.consumption || []).reduce((s, c) => s + c.diff, 0);
    const div = document.createElement('div');
    div.className = 'item';

    const span = document.createElement('span');
    span.textContent = `${item.name} - ${total.toFixed(2)} ${item.unit}`;
    div.appendChild(span);

    const input = document.createElement('input');
    input.type = 'number';
    input.placeholder = 'Change';

    const weekInput = document.createElement('input');
    weekInput.type = 'number';
    weekInput.placeholder = 'Week';
    weekInput.min = 1;
    weekInput.max = 52;
    weekInput.className = 'week-input';

    const ul = document.createElement('ul');
    ul.className = 'history';

    function updateHistory() {
      ul.innerHTML = '';
      (item.consumption || []).forEach((entry, idx) => {
        const li = document.createElement('li');
        const dt = entry.date ? new Date(entry.date).toLocaleDateString() : '';
        li.textContent = `${dt} : ${entry.diff > 0 ? '+' : ''}${entry.diff}`;
        const btn = document.createElement('button');
        btn.textContent = 'X';
        btn.addEventListener('click', async () => {
          const [removed] = item.consumption.splice(idx, 1);
          item.currentStockByWeek = item.currentStockByWeek || {};
          const w = removed.week;
          item.currentStockByWeek[w] = (item.currentStockByWeek[w] || 0) - removed.diff;
          await storageSet('items', items);
          span.textContent = `${item.name} - ${(item.consumption || []).reduce((s, c) => s + c.diff, 0).toFixed(2)} ${item.unit}`;
          updateHistory();
        });
        li.appendChild(document.createTextNode(' '));
        li.appendChild(btn);
        ul.appendChild(li);
      });
    }

    input.addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        const change = parseFloat(input.value);
        const week = parseInt(weekInput.value, 10);
        if (!isNaN(change) && !isNaN(week)) {
          item.consumption = Array.isArray(item.consumption) ? item.consumption : [];
          item.consumption.unshift({ week, diff: change, date: new Date().toISOString() });
          item.currentStockByWeek = item.currentStockByWeek || {};
          item.currentStockByWeek[week] = (item.currentStockByWeek[week] || 0) + change;
          await storageSet('items', items);
          span.textContent = `${item.name} - ${item.consumption.reduce((s, c) => s + c.diff, 0).toFixed(2)} ${item.unit}`;
          input.value = '';
          weekInput.value = '';
          updateHistory();
        }
      }
    });

    div.appendChild(document.createTextNode(' '));
    div.appendChild(input);
    div.appendChild(document.createTextNode(' '));
    div.appendChild(weekInput);
    div.appendChild(ul);
    parent.appendChild(div);
    updateHistory();
  }, headerState);
}

function applyFilter() {
  const term = document.getElementById('searchBox').value.toLowerCase();
  const list = !term
    ? items
    : items.filter(i => i.name.toLowerCase().includes(term));
  render(list);
}

async function init() {
  items = await storageGet('items');
  applyFilter();
  document.getElementById('searchBox').addEventListener('input', applyFilter);
}

init();


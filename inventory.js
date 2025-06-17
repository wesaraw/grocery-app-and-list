import { loadJSON } from './utils/dataLoader.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';

async function loadStock() {
  return new Promise(async resolve => {
    chrome.storage.local.get('currentStock', async data => {
      if (data.currentStock) {
        resolve(data.currentStock);
      } else {
        const stock = await loadJSON(STOCK_PATH);
        resolve(stock);
      }
    });
  });
}

function saveStock(stock) {
  return new Promise(resolve => {
    chrome.storage.local.set({ currentStock: stock }, () => resolve());
  });
}

function createItemRow(item, stockMap) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = `${item.name} - ${item.amount} ${item.unit}`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'New';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        item.amount = val;
        span.textContent = `${item.name} - ${item.amount} ${item.unit}`;
        await saveStock(Array.from(stockMap.values()));
        input.value = '';
      }
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);

  return div;
}

async function init() {
  const container = document.getElementById('inventory');
  const stock = await loadStock();
  const stockMap = new Map(stock.map(i => [i.name, i]));

  stock.forEach(item => {
    const row = createItemRow(item, stockMap);
    container.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', init);

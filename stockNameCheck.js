import { loadJSON } from './utils/dataLoader.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const STOCK_KEY = 'currentStock';

function loadArray(key, path) {
  return new Promise(async resolve => {
    try {
      chrome.storage.local.get(key, async data => {
        if (data[key]) {
          resolve(data[key]);
        } else {
          const arr = await loadJSON(path);
          resolve(arr);
        }
      });
    } catch (e) {
      const arr = await loadJSON(path);
      resolve(arr);
    }
  });
}

function saveStock(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STOCK_KEY]: arr }, () => resolve());
  });
}

function createRow(item, stock) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = item.category || 'Unnamed item';
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Name';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (!val) return;
      item.name = val;
      await saveStock(stock);
      div.remove();
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);
  return div;
}

async function init() {
  const container = document.getElementById('items');
  const stock = await loadArray(STOCK_KEY, STOCK_PATH);
  const missing = stock.filter(n => !n.name || !n.name.trim());
  missing.forEach(item => container.appendChild(createRow(item, stock)));
}

document.addEventListener('DOMContentLoaded', init);

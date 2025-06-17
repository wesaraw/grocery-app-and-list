import { loadJSON } from './utils/dataLoader.js';
import { getStockForWeek } from './utils/timelineHelper.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';

async function loadPurchases() {
  return new Promise(resolve => {
    chrome.storage.local.get('purchases', data => {
      resolve(data.purchases || {});
    });
  });
}

function savePurchases(map) {
  return new Promise(resolve => {
    chrome.storage.local.set({ purchases: map }, () => resolve());
  });
}

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
function createItemRow(name, amount, unit, purchasesMap, week) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = `${name} - ${amount} ${unit}`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'New';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        const diff = val - amount;
        if (diff !== 0) {
          if (!purchasesMap[name]) purchasesMap[name] = [];
          purchasesMap[name].push({
            purchase_week: week,
            quantity_purchased: diff,
            date_added: new Date().toISOString()
          });
          await savePurchases(purchasesMap);
          amount = val;
        }
        span.textContent = `${name} - ${amount} ${unit}`;
        input.value = '';
      }
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);

  return div;
}

let baseStock = [];
let purchasesMap = {};

function renderWeek(week) {
  const container = document.getElementById('inventory');
  container.innerHTML = '';
  const stockForWeek = getStockForWeek(baseStock, purchasesMap, week);
  baseStock.forEach(item => {
    const amt = stockForWeek.get(item.name) || 0;
    const row = createItemRow(item.name, amt, item.unit, purchasesMap, week);
    container.appendChild(row);
  });
}

async function init() {
  const weekInput = document.getElementById('week-number');
  baseStock = await loadStock();
  purchasesMap = await loadPurchases();

  renderWeek(parseInt(weekInput.value, 10) || 1);

  weekInput.addEventListener('change', () => {
    const w = parseInt(weekInput.value, 10) || 1;
    renderWeek(w);
  });
}

document.addEventListener('DOMContentLoaded', init);

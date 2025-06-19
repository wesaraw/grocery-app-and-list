import { loadJSON } from './utils/dataLoader.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';

function loadArray(key, path) {
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      if (data[key]) {
        resolve(data[key]);
      } else {
        const arr = await loadJSON(path);
        resolve(arr);
      }
    });
  });
}

function save(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

let needs = [];
let consumption = [];
let stock = [];
let rows = [];
let changed = false;

function markChanged() {
  if (!changed) {
    changed = true;
    document.getElementById('saveBtn').classList.remove('hidden');
  }
}

function buildRow(item) {
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  nameTd.textContent = item.name;
  const homeTd = document.createElement('td');
  homeTd.textContent = item.home_unit;
  const inputTd = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  inputTd.appendChild(input);
  const wholeTd = document.createElement('td');
  wholeTd.textContent = item.treat_as_whole_unit;
  const checkTd = document.createElement('td');
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = item.treat_as_whole_unit;
  checkTd.appendChild(chk);

  input.addEventListener('input', () => {
    if (input.value.trim() && input.value.trim() !== item.home_unit) {
      markChanged();
    }
  });
  chk.addEventListener('change', () => {
    if (chk.checked !== item.treat_as_whole_unit) markChanged();
  });

  tr.appendChild(nameTd);
  tr.appendChild(homeTd);
  tr.appendChild(inputTd);
  tr.appendChild(wholeTd);
  tr.appendChild(checkTd);

  return { tr, input, chk, item };
}

async function init() {
  [needs, consumption, stock] = await Promise.all([
    loadArray('yearlyNeeds', NEEDS_PATH),
    loadArray('monthlyConsumption', CONSUMPTION_PATH),
    loadArray('currentStock', STOCK_PATH)
  ]);
  const tbody = document.getElementById('uom-list');
  needs.forEach(n => {
    const row = buildRow(n);
    rows.push(row);
    tbody.appendChild(row.tr);
  });
}

async function saveChanges() {
  rows.forEach(r => {
    const newUnit = r.input.value.trim();
    const changedUnit = newUnit && newUnit !== r.item.home_unit;
    const changedWhole = r.chk.checked !== r.item.treat_as_whole_unit;
    if (changedUnit) {
      r.item.home_unit = newUnit;
      const cons = consumption.find(c => c.name === r.item.name);
      if (cons) cons.unit = newUnit;
      const st = stock.find(s => s.name === r.item.name);
      if (st) st.unit = newUnit;
    }
    if (changedWhole) {
      r.item.treat_as_whole_unit = r.chk.checked;
    }
  });
  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock)
  ]);
  document.getElementById('saveBtn').classList.add('hidden');
  changed = false;
}

document.addEventListener('DOMContentLoaded', init);
document.getElementById('saveBtn').addEventListener('click', saveChanges);

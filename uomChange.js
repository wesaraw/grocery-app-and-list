import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory } from './utils/sortByCategory.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';

let filterText = '';
let allNeeds = [];
let tbody;

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

function updateSaveVisibility(row) {
  const newUnit = row.input.value.trim();
  const unitChanged = newUnit && newUnit !== row.item.home_unit;
  const wholeChanged = row.chk.checked !== row.item.treat_as_whole_unit;
  if (unitChanged || wholeChanged) {
    row.saveBtn.classList.remove('hidden');
  } else {
    row.saveBtn.classList.add('hidden');
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
  const saveTd = document.createElement('td');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'hidden';
  saveTd.appendChild(saveBtn);
  const row = { tr, input, chk, item, saveBtn, homeTd, wholeTd };

  input.addEventListener('input', () => updateSaveVisibility(row));
  chk.addEventListener('change', () => updateSaveVisibility(row));
  saveBtn.addEventListener('click', () => saveRow(row));

  tr.appendChild(nameTd);
  tr.appendChild(homeTd);
  tr.appendChild(inputTd);
  tr.appendChild(wholeTd);
  tr.appendChild(checkTd);
  tr.appendChild(saveTd);

  return row;
}

function addCategoryRow(tbody, cat) {
  const tr = document.createElement('tr');
  const th = document.createElement('th');
  th.colSpan = 6;
  th.className = 'category-header';
  th.textContent = cat;
  tr.appendChild(th);
  tbody.appendChild(tr);
  return tr;
}

async function init() {
  [needs, consumption, stock] = await Promise.all([
    loadArray('yearlyNeeds', NEEDS_PATH),
    loadArray('monthlyConsumption', CONSUMPTION_PATH),
    loadArray('currentStock', STOCK_PATH)
  ]);
  tbody = document.getElementById('uom-list');
  allNeeds = sortItemsByCategory(needs);

  function render() {
    tbody.innerHTML = '';
    let lastCat = null;
    let headerRow = null;
    let itemRows = [];
    const arr = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    function finalizeHeader() {
      if (!headerRow) return;
      headerRow.dataset.hidden = 'true';
      itemRows.forEach(r => {
        r.style.display = 'none';
      });
      const th = headerRow.querySelector('.category-header');
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const hidden = headerRow.dataset.hidden === 'true';
        headerRow.dataset.hidden = hidden ? 'false' : 'true';
        itemRows.forEach(r => {
          r.style.display = hidden ? '' : 'none';
        });
      });
    }

    arr.forEach(n => {
      const cat = n.category || 'Other';
      if (cat !== lastCat) {
        finalizeHeader();
        lastCat = cat;
        headerRow = addCategoryRow(tbody, cat);
        itemRows = [];
      }
      const row = buildRow(n);
      rows.push(row);
      itemRows.push(row.tr);
      tbody.appendChild(row.tr);
    });
    finalizeHeader();
  }

  render();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

async function saveRow(row) {
  const newUnit = row.input.value.trim();
  const changedUnit = newUnit && newUnit !== row.item.home_unit;
  const changedWhole = row.chk.checked !== row.item.treat_as_whole_unit;
  if (!changedUnit && !changedWhole) return;

  if (changedUnit) {
    row.item.home_unit = newUnit;
    const cons = consumption.find(c => c.name === row.item.name);
    if (cons) cons.unit = newUnit;
    const st = stock.find(s => s.name === row.item.name);
    if (st) st.unit = newUnit;
    row.homeTd.textContent = newUnit;
  }
  if (changedWhole) {
    row.item.treat_as_whole_unit = row.chk.checked;
    row.wholeTd.textContent = row.item.treat_as_whole_unit;
  }

  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock)
  ]);
  row.saveBtn.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', init);

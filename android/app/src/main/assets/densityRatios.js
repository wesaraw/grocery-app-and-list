import { loadJSON } from './utils/dataLoader.js';
import { loadDensityMap, saveDensityMap } from './utils/unitNormalize.js';
import { sortItemsByCategory } from './utils/sortByCategory.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const UOM_PATH = 'Required for grocery app/uom_conversion_table.json';

let allNeeds = [];
let densityMap = {};
let tbody;
let filterText = '';
const headerState = {};
let unitOptions = [];

function prepareUnitOptions(uomTable) {
  if (!uomTable) return [];
  return Object.keys(uomTable)
    .sort((a, b) => a.localeCompare(b));
}

function createUnitSelect() {
  const select = document.createElement('select');
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = '';
  select.appendChild(emptyOption);
  unitOptions.forEach(unit => {
    const opt = document.createElement('option');
    opt.value = unit;
    opt.textContent = unit;
    select.appendChild(opt);
  });
  return select;
}

function setSelectValue(select, value) {
  if (!value) return;
  const exists = Array.from(select.options).some(opt => opt.value === value);
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
  select.value = value;
}

function parseRatio(str) {
  const m1 = str.match(/^([0-9.]+)\s*:\s*1$/);
  if (m1) return parseFloat(m1[1]);
  const m2 = str.match(/^1\s*:\s*([0-9.]+)$/);
  if (m2) return 1 / parseFloat(m2[1]);
  return null;
}

function buildRow(item) {
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  nameTd.textContent = item.name;
  const ratioTd = document.createElement('td');
  const ratioInput = document.createElement('input');
  ratioInput.type = 'text';
  ratioInput.value = densityMap[item.name]?.ratio ? `${densityMap[item.name].ratio}:1` : '1:1';
  ratioTd.appendChild(ratioInput);
  const cupTd = document.createElement('td');
  const cupInput = document.createElement('input');
  cupInput.type = 'text';
  cupInput.placeholder = 'enter 1 cups weight in grams';
  cupTd.appendChild(cupInput);
  const convertTd = document.createElement('td');
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = densityMap[item.name]?.convert || false;
  convertTd.appendChild(chk);
  const normalized = densityMap[item.name]?.normalized || {};
  const fromTd = document.createElement('td');
  fromTd.className = 'normalized-cell';
  const fromSelect = createUnitSelect();
  setSelectValue(fromSelect, normalized.fromUnit || '');
  const fromInput = document.createElement('input');
  fromInput.type = 'number';
  fromInput.step = 'any';
  if (normalized.fromValue !== undefined) {
    fromInput.value = normalized.fromValue;
  }
  fromTd.appendChild(fromSelect);
  fromTd.appendChild(fromInput);
  const toTd = document.createElement('td');
  toTd.className = 'normalized-cell';
  const toSelect = createUnitSelect();
  setSelectValue(toSelect, normalized.toUnit || '');
  const toInput = document.createElement('input');
  toInput.type = 'number';
  toInput.step = 'any';
  if (normalized.toValue !== undefined) {
    toInput.value = normalized.toValue;
  }
  toTd.appendChild(toSelect);
  toTd.appendChild(toInput);
  const saveTd = document.createElement('td');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'hidden';
  saveTd.appendChild(saveBtn);

  function showSave() {
    saveBtn.classList.remove('hidden');
  }
  ratioInput.addEventListener('input', showSave);
  cupInput.addEventListener('input', showSave);
  chk.addEventListener('change', showSave);
  fromSelect.addEventListener('change', showSave);
  fromInput.addEventListener('input', showSave);
  toSelect.addEventListener('change', showSave);
  toInput.addEventListener('input', showSave);

  saveBtn.addEventListener('click', async () => {
    let ratioVal = parseRatio(ratioInput.value.trim());
    if (!ratioVal && cupInput.value.trim()) {
      const w = parseFloat(cupInput.value.trim());
      if (!isNaN(w)) ratioVal = w / 240;
    }
    if (!ratioVal) ratioVal = 1;
    const updated = {
      ...densityMap[item.name],
      convert: chk.checked,
      ratio: ratioVal
    };
    delete updated.normalized;
    const fromUnit = fromSelect.value.trim();
    const toUnit = toSelect.value.trim();
    const fromValueStr = fromInput.value.trim();
    const toValueStr = toInput.value.trim();
    if (fromUnit && toUnit && fromValueStr !== '' && toValueStr !== '') {
      const fromValue = parseFloat(fromValueStr);
      const toValue = parseFloat(toValueStr);
      if (!Number.isNaN(fromValue) && !Number.isNaN(toValue)) {
        updated.normalized = {
          fromUnit,
          fromValue,
          toUnit,
          toValue
        };
      }
    }
    densityMap[item.name] = updated;
    await saveDensityMap(densityMap);
    saveBtn.classList.add('hidden');
  });

  tr.appendChild(nameTd);
  tr.appendChild(ratioTd);
  tr.appendChild(cupTd);
  tr.appendChild(convertTd);
  tr.appendChild(fromTd);
  tr.appendChild(toTd);
  tr.appendChild(saveTd);
  return tr;
}

async function init() {
  const [needs, densities, uomTable] = await Promise.all([
    loadJSON(NEEDS_PATH),
    loadDensityMap(),
    loadJSON(UOM_PATH)
  ]);
  allNeeds = sortItemsByCategory(needs);
  densityMap = densities;
  unitOptions = prepareUnitOptions(uomTable);
  tbody = document.getElementById('ratio-list');
  render();
  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

function render() {
  tbody.innerHTML = '';
  const arr = filterText
    ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
    : allNeeds;

  let lastCat = null;
  let headerRow = null;
  let itemRows = [];

  function addCategoryRow(cat) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.colSpan = 7;
    th.className = 'category-header';
    th.textContent = cat;
    tr.appendChild(th);
    tbody.appendChild(tr);
    return tr;
  }

  function finalizeHeader(cat, row, rowsArr) {
    if (!row) return;
    const hidden = headerState[cat] !== undefined ? headerState[cat] : true;
    row.dataset.hidden = hidden ? 'true' : 'false';
    rowsArr.forEach(r => {
      r.style.display = hidden ? 'none' : '';
    });
    const th = row.querySelector('.category-header');
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const isHidden = row.dataset.hidden === 'true';
      row.dataset.hidden = isHidden ? 'false' : 'true';
      rowsArr.forEach(r => {
        r.style.display = isHidden ? '' : 'none';
      });
      headerState[cat] = !isHidden;
    });
  }

  arr.forEach(item => {
    const cat = item.category || 'Other';
    if (cat !== lastCat) {
      finalizeHeader(lastCat, headerRow, itemRows);
      lastCat = cat;
      headerRow = addCategoryRow(cat);
      itemRows = [];
    }
    const row = buildRow(item);
    itemRows.push(row);
    tbody.appendChild(row);
  });
  finalizeHeader(lastCat, headerRow, itemRows);
}

document.addEventListener('DOMContentLoaded', init);

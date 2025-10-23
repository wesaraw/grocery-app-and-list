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

function normalizeState(value) {
  if (!value || typeof value !== 'string') return '';
  const lower = value.trim().toLowerCase();
  return lower === 'cooked' || lower === 'dry' ? lower : '';
}

function oppositeState(state) {
  return state === 'cooked' ? 'dry' : state === 'dry' ? 'cooked' : '';
}

function formatStateLabel(state) {
  if (!state) return '';
  return state.charAt(0).toUpperCase() + state.slice(1);
}

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
  const prepTd = document.createElement('td');
  const prepWrapper = document.createElement('div');
  prepWrapper.className = 'prep-toggle-group';
  const cookedLabel = document.createElement('label');
  const cookedToggle = document.createElement('input');
  cookedToggle.type = 'checkbox';
  cookedToggle.value = 'cooked';
  cookedLabel.appendChild(cookedToggle);
  cookedLabel.appendChild(document.createTextNode('Cooked'));
  const dryLabel = document.createElement('label');
  const dryToggle = document.createElement('input');
  dryToggle.type = 'checkbox';
  dryToggle.value = 'dry';
  dryLabel.appendChild(dryToggle);
  dryLabel.appendChild(document.createTextNode('Dry'));
  prepWrapper.appendChild(cookedLabel);
  prepWrapper.appendChild(dryLabel);
  prepTd.appendChild(prepWrapper);
  const normalized = densityMap[item.name]?.normalized || {};
  let currentPrepState = normalizeState(densityMap[item.name]?.prepState);
  if (!currentPrepState) {
    currentPrepState = normalizeState(normalized.fromState);
  }
  const fromTd = document.createElement('td');
  fromTd.className = 'normalized-cell';
  const fromStateLabel = document.createElement('span');
  fromStateLabel.className = 'state-label';
  const fromSelect = createUnitSelect();
  setSelectValue(fromSelect, normalized.fromUnit || '');
  const fromInput = document.createElement('input');
  fromInput.type = 'number';
  fromInput.step = 'any';
  if (normalized.fromValue !== undefined) {
    fromInput.value = normalized.fromValue;
  }
  fromTd.appendChild(fromStateLabel);
  fromTd.appendChild(fromSelect);
  fromTd.appendChild(fromInput);
  const toTd = document.createElement('td');
  toTd.className = 'normalized-cell';
  const toStateLabel = document.createElement('span');
  toStateLabel.className = 'state-label';
  const toSelect = createUnitSelect();
  setSelectValue(toSelect, normalized.toUnit || '');
  const toInput = document.createElement('input');
  toInput.type = 'number';
  toInput.step = 'any';
  if (normalized.toValue !== undefined) {
    toInput.value = normalized.toValue;
  }
  toTd.appendChild(toStateLabel);
  toTd.appendChild(toSelect);
  toTd.appendChild(toInput);
  const saveTd = document.createElement('td');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'hidden';
  saveTd.appendChild(saveBtn);

  function updatePrepStateLabels(state) {
    const fromLabel = formatStateLabel(state);
    const toLabel = formatStateLabel(oppositeState(state));
    fromStateLabel.textContent = fromLabel;
    toStateLabel.textContent = toLabel;
    fromInput.placeholder = fromLabel ? `${fromLabel} amount` : '';
    toInput.placeholder = toLabel ? `${toLabel} amount` : '';
    fromSelect.title = fromLabel ? `${fromLabel} measurement` : '';
    toSelect.title = toLabel ? `${toLabel} measurement` : '';
  }

  function applyPrepState(state) {
    currentPrepState = normalizeState(state);
    cookedToggle.checked = currentPrepState === 'cooked';
    dryToggle.checked = currentPrepState === 'dry';
    updatePrepStateLabels(currentPrepState);
  }

  function showSave() {
    saveBtn.classList.remove('hidden');
  }
  ratioInput.addEventListener('input', showSave);
  cupInput.addEventListener('input', showSave);
  chk.addEventListener('change', showSave);
  cookedToggle.addEventListener('change', () => {
    if (cookedToggle.checked) {
      applyPrepState('cooked');
      dryToggle.checked = false;
    } else if (!dryToggle.checked) {
      applyPrepState('');
    }
    showSave();
  });
  dryToggle.addEventListener('change', () => {
    if (dryToggle.checked) {
      applyPrepState('dry');
      cookedToggle.checked = false;
    } else if (!cookedToggle.checked) {
      applyPrepState('');
    }
    showSave();
  });
  fromSelect.addEventListener('change', showSave);
  fromInput.addEventListener('input', showSave);
  toSelect.addEventListener('change', showSave);
  toInput.addEventListener('input', showSave);

  applyPrepState(currentPrepState);

  saveBtn.addEventListener('click', async () => {
    let ratioVal;
    const cupWeightStr = cupInput.value.trim();
    if (cupWeightStr) {
      const grams = parseFloat(cupWeightStr);
      if (Number.isFinite(grams) && grams > 0) {
        ratioVal = grams / 240;
        chk.checked = true;
        const formattedRatio = Number.isInteger(ratioVal)
          ? ratioVal.toString()
          : ratioVal.toFixed(4).replace(/\.0+$|0+$/, '');
        ratioInput.value = `${formattedRatio}:1`;
      }
    }
    if (!ratioVal) {
      ratioVal = parseRatio(ratioInput.value.trim());
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
        const prepState = currentPrepState;
        if (prepState) {
          updated.normalized.fromState = prepState;
          updated.normalized.toState = oppositeState(prepState);
        }
      }
    }
    const prepState = currentPrepState;
    if (prepState) {
      updated.prepState = prepState;
    } else {
      delete updated.prepState;
      if (updated.normalized) {
        delete updated.normalized.fromState;
        delete updated.normalized.toState;
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
  tr.appendChild(prepTd);
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
    th.colSpan = 8;
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

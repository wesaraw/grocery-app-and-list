import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory } from './utils/sortByCategory.js';
import {
  loadDensityData,
  setDensityRatio
} from './utils/densityUtils.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

function loadNeeds() {
  return new Promise(async resolve => {
    chrome.storage.local.get('yearlyNeeds', async data => {
      if (data.yearlyNeeds) {
        resolve(data.yearlyNeeds);
      } else {
        const arr = await loadJSON(NEEDS_PATH);
        resolve(arr);
      }
    });
  });
}

let allItems = [];
let densityMap = new Map();
let rows = [];
let filterText = '';
const headerState = {};

function parseRatio(str) {
  const m = str.trim().match(/^(\d*\.?\d+)\s*:\s*(\d*\.?\d+)$/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  if (isNaN(a) || isNaN(b) || a <= 0 || b <= 0) return null;
  if (b === 1) return a;
  if (a === 1) return 1 / b;
  return null;
}

function ratioString(val) {
  return `${val.toFixed(3)}:1`;
}

function updateSaveVisibility(row) {
  const gramVal = row.grams.value.trim();
  const ratioVal = row.ratio.value.trim();
  const changed =
    gramVal || ratioVal !== ratioString(row.currentRatio);
  row.saveBtn.classList.toggle('hidden', !changed);
  row.error.classList.add('hidden');
}

function buildRow(item) {
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  nameTd.textContent = item.name;
  const ratioTd = document.createElement('td');
  const ratioInput = document.createElement('input');
  ratioInput.type = 'text';
  const curRatio = densityMap.get(item.name) ?? 1.0;
  ratioInput.value = ratioString(curRatio);
  ratioTd.appendChild(ratioInput);
  const err = document.createElement('div');
  err.className = 'error hidden';
  ratioTd.appendChild(err);
  const gramTd = document.createElement('td');
  const gramInput = document.createElement('input');
  gramInput.type = 'number';
  gramInput.step = 'any';
  gramInput.placeholder = 'enter 1 cup weight in grams';
  gramTd.appendChild(gramInput);
  const saveTd = document.createElement('td');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'hidden';
  saveTd.appendChild(saveBtn);

  const row = {
    tr,
    ratio: ratioInput,
    grams: gramInput,
    saveBtn,
    error: err,
    item,
    currentRatio: curRatio
  };

  ratioInput.addEventListener('input', () => updateSaveVisibility(row));
  gramInput.addEventListener('input', () => updateSaveVisibility(row));

  saveBtn.addEventListener('click', async () => {
    let ratioVal = row.currentRatio;
    if (row.grams.value.trim()) {
      const g = parseFloat(row.grams.value);
      if (!isNaN(g) && g > 0) ratioVal = g / 240;
      else return;
    } else if (row.ratio.value.trim() !== ratioString(row.currentRatio)) {
      const parsed = parseRatio(row.ratio.value);
      if (parsed == null) {
        row.ratio.value = '';
        row.error.textContent = '{value}:1 or 1:{value}';
        row.error.classList.remove('hidden');
        updateSaveVisibility(row);
        return;
      }
      ratioVal = parsed;
    } else {
      return;
    }
    await setDensityRatio({ itemName: row.item.name, measuredWeightG: ratioVal * 240 });
    row.currentRatio = ratioVal;
    row.ratio.value = ratioString(ratioVal);
    row.grams.value = '';
    row.saveBtn.classList.add('hidden');
  });

  tr.appendChild(nameTd);
  tr.appendChild(ratioTd);
  tr.appendChild(gramTd);
  tr.appendChild(saveTd);
  return row;
}

function render() {
  const tbody = document.getElementById('ratioBody');
  tbody.innerHTML = '';
  let arr = sortItemsByCategory(allItems);
  if (filterText) {
    arr = arr.filter(it => it.name.toLowerCase().includes(filterText));
  }
  rows = arr.map(buildRow);
  let lastCat = null;
  let catHeader = null;
  let nodes = [];

  function finalize(cat, hdr, ns) {
    if (!hdr) return;
    const hidden = headerState[cat] !== undefined ? headerState[cat] : true;
    hdr.dataset.hidden = hidden ? 'true' : 'false';
    ns.forEach(n => {
      n.tr.style.display = hidden ? 'none' : '';
    });
    hdr.addEventListener('click', () => {
      const isHidden = hdr.dataset.hidden === 'true';
      hdr.dataset.hidden = isHidden ? 'false' : 'true';
      ns.forEach(n => {
        n.tr.style.display = isHidden ? '' : 'none';
      });
      headerState[cat] = !isHidden;
    });
  }

  arr.forEach((item, idx) => {
    const cat = item.category || 'Other';
    if (cat !== lastCat) {
      finalize(lastCat, catHeader, nodes);
      lastCat = cat;
      catHeader = document.createElement('tr');
      const th = document.createElement('th');
      th.colSpan = 4;
      th.textContent = cat;
      th.className = 'category-header';
      catHeader.appendChild(th);
      tbody.appendChild(catHeader);
      nodes = [];
    }
    const row = buildRow(item);
    nodes.push(row);
    tbody.appendChild(row.tr);
  });
  finalize(lastCat, catHeader, nodes);
}

async function init() {
  [allItems, densityMap] = await Promise.all([
    loadNeeds(),
    loadDensityData().then(arr => new Map(arr.map(r => [r.item_name, r.density_ratio])))
  ]);
  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
  render();
}

document.addEventListener('DOMContentLoaded', init);

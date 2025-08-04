import { loadJSON } from './utils/dataLoader.js';
import { loadDensityMap, saveDensityMap } from './utils/unitNormalize.js';
import { sortItemsByCategory } from './utils/sortByCategory.js';
import { loadArray as loadItemArray } from './utils/itemRegistry.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

let allNeeds = [];
let densityMap = {};
let tbody;
let filterText = '';

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

  saveBtn.addEventListener('click', async () => {
    let ratioVal = parseRatio(ratioInput.value.trim());
    if (!ratioVal && cupInput.value.trim()) {
      const w = parseFloat(cupInput.value.trim());
      if (!isNaN(w)) ratioVal = w / 240;
    }
    if (!ratioVal) ratioVal = 1;
    densityMap[item.name] = { convert: chk.checked, ratio: ratioVal };
    await saveDensityMap(densityMap);
    saveBtn.classList.add('hidden');
  });

  tr.appendChild(nameTd);
  tr.appendChild(ratioTd);
  tr.appendChild(cupTd);
  tr.appendChild(convertTd);
  tr.appendChild(saveTd);
  return tr;
}

async function loadNeeds() {
  const arr = await loadItemArray('yearlyNeeds');
  if (arr.length > 0) return arr;
  return await loadJSON(NEEDS_PATH);
}

async function init() {
  [allNeeds, densityMap] = await Promise.all([
    loadNeeds(),
    loadDensityMap()
  ]);
  allNeeds = sortItemsByCategory(allNeeds);
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
  arr.forEach(item => {
    const row = buildRow(item);
    tbody.appendChild(row);
  });
}

document.addEventListener('DOMContentLoaded', init);

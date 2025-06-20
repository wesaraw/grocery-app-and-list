import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONS_PATH = 'Required for grocery app/monthly_consumption_table.json';

let filterText = '';
const headerState = {};
let allNeeds = [];
let needsMap;
let consMap;
let container;

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

const loadNeeds = () => loadArray('yearlyNeeds', NEEDS_PATH);
const loadConsumption = () => loadArray('monthlyConsumption', CONS_PATH);

function saveNeeds(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ yearlyNeeds: arr }, () => resolve());
  });
}

function saveConsumption(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ monthlyConsumption: arr }, () => resolve());
  });
}

function createRow(item, needsMap, consMap, needsArr, consArr) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  const monthly = consMap.get(item.name)?.monthly_consumption || 0;
  const yearly = needsMap.get(item.name)?.total_needed_year || 0;
  span.textContent = `${item.name} - ${monthly}/mo - ${yearly}/yr`;
  div.appendChild(span);

  const mInput = document.createElement('input');
  mInput.type = 'number';
  mInput.placeholder = 'Monthly';
  const yInput = document.createElement('input');
  yInput.type = 'number';
  yInput.placeholder = 'Yearly';

  async function commit() {
    const mVal = parseFloat(mInput.value);
    const yVal = parseFloat(yInput.value);
    if (!isNaN(mVal)) {
      let rec = consMap.get(item.name);
      if (!rec) {
        rec = { name: item.name, monthly_consumption: mVal, unit: item.home_unit };
        consArr.push(rec);
        consMap.set(item.name, rec);
      } else {
        rec.monthly_consumption = mVal;
      }
    }
    if (!isNaN(yVal)) {
      let rec = needsMap.get(item.name);
      if (rec) {
        rec.total_needed_year = yVal;
      }
    }
    span.textContent = `${item.name} - ${consMap.get(item.name)?.monthly_consumption || 0}/mo - ${needsMap.get(item.name)?.total_needed_year || 0}/yr`;
    mInput.value = '';
    yInput.value = '';
    await Promise.all([saveNeeds(needsArr), saveConsumption(consArr)]);
    try {
      chrome.runtime.sendMessage({ type: 'inventory-updated' });
    } catch (_) {}
  }

  mInput.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
  yInput.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(mInput);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(yInput);
  return div;
}

async function init() {
  container = document.getElementById('plans');
  const [needs, consumption] = await Promise.all([loadNeeds(), loadConsumption()]);
  allNeeds = sortItemsByCategory(needs);
  needsMap = new Map(needs.map(n => [n.name, n]));
  consMap = new Map(consumption.map(c => [c.name, c]));

  function render() {
    const arr = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    container.innerHTML = '';
    renderItemsWithCategoryHeaders(
      arr,
      container,
      item => createRow(item, needsMap, consMap, needs, consumption),
      headerState
    );
  }

  render();
  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

document.addEventListener('DOMContentLoaded', init);


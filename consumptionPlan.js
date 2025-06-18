import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';

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
const loadConsumption = () => loadArray('monthlyConsumption', CONSUMPTION_PATH);

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

function sendUpdate() {
  try {
    chrome.runtime.sendMessage({ type: 'plan-updated' });
  } catch (_) {}
}

function createRow(item, consMap, needsMap, consArr, needsArr) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  const monthly = consMap.get(item.name)?.monthly_consumption || 0;
  const yearly = needsMap.get(item.name)?.total_needed_year || 0;
  span.textContent = `${item.name} - ${monthly}/mo - ${yearly} yr`;
  div.appendChild(span);

  const mInput = document.createElement('input');
  mInput.type = 'number';
  mInput.placeholder = 'Monthly';
  mInput.step = 'any';
  async function commitMonthly() {
    const val = parseFloat(mInput.value);
    if (!isNaN(val)) {
      let rec = consMap.get(item.name);
      if (!rec) {
        rec = { name: item.name, monthly_consumption: val, unit: item.home_unit };
        consArr.push(rec);
        consMap.set(item.name, rec);
      } else {
        rec.monthly_consumption = val;
      }
      span.textContent = `${item.name} - ${val}/mo - ${yearly} yr`;
      mInput.value = '';
      await saveConsumption(consArr);
      sendUpdate();
    }
  }
  mInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitMonthly(); });
  mInput.addEventListener('blur', commitMonthly);

  const yInput = document.createElement('input');
  yInput.type = 'number';
  yInput.placeholder = 'Yearly';
  yInput.step = 'any';
  async function commitYearly() {
    const val = parseFloat(yInput.value);
    if (!isNaN(val)) {
      let rec = needsMap.get(item.name);
      if (!rec) {
        rec = {
          name: item.name,
          total_needed_year: val,
          home_unit: item.home_unit,
          treat_as_whole_unit: item.treat_as_whole_unit,
          category: item.category || ''
        };
        needsArr.push(rec);
        needsMap.set(item.name, rec);
      } else {
        rec.total_needed_year = val;
      }
      span.textContent = `${item.name} - ${monthly}/mo - ${val} yr`;
      yInput.value = '';
      await saveNeeds(needsArr);
      sendUpdate();
    }
  }
  yInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitYearly(); });
  yInput.addEventListener('blur', commitYearly);

  div.appendChild(document.createTextNode(' '));
  div.appendChild(mInput);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(yInput);
  return div;
}

async function init() {
  const [consumption, needs] = await Promise.all([loadConsumption(), loadNeeds()]);
  const sortedNeeds = sortItemsByCategory(needs);
  const consMap = new Map(consumption.map(c => [c.name, c]));
  const needsMap = new Map(needs.map(n => [n.name, n]));
  const container = document.getElementById('plan');
  renderItemsWithCategoryHeaders(sortedNeeds, container, item =>
    createRow(item, consMap, needsMap, consumption, needs)
  );
}

document.addEventListener('DOMContentLoaded', init);

import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import { loadMealPlanData } from './utils/mealNeedsCalculator.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONS_PATH = 'Required for grocery app/monthly_consumption_table.json';

let filterText = '';
const headerState = {};
let allNeeds = [];
let needsMap;
let consMap;
let mealYearMap;
let mealMonthMap;
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

function createRow(
  item,
  needsMap,
  consMap,
  mealYearMap,
  mealMonthMap,
  needsArr,
  consArr
) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  const monthlyUser = consMap.get(item.name)?.monthly_consumption || 0;
  const yearlyUser = needsMap.get(item.name)?.total_needed_year || 0;
  const monthlyMeal = mealMonthMap.get(item.name) || 0;
  const yearlyMeal = mealYearMap.get(item.name) || 0;
  span.textContent = `${item.name} - ${(monthlyUser + monthlyMeal).toFixed(2)}/mo - ${(yearlyUser + yearlyMeal).toFixed(2)}/yr`;
  div.appendChild(span);

  const mInput = document.createElement('input');
  mInput.type = 'number';
  mInput.placeholder = 'Monthly User';
  mInput.value = monthlyUser;
  const mMeal = document.createElement('input');
  mMeal.type = 'number';
  mMeal.disabled = true;
  mMeal.value = monthlyMeal.toFixed(2);
  const yInput = document.createElement('input');
  yInput.type = 'number';
  yInput.placeholder = 'Yearly User';
  yInput.value = yearlyUser;
  const yMeal = document.createElement('input');
  yMeal.type = 'number';
  yMeal.disabled = true;
  yMeal.value = yearlyMeal.toFixed(2);

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
    const newMonthly = consMap.get(item.name)?.monthly_consumption || 0;
    const newYearly = needsMap.get(item.name)?.total_needed_year || 0;
    span.textContent = `${item.name} - ${(newMonthly + monthlyMeal).toFixed(2)}/mo - ${(newYearly + yearlyMeal).toFixed(2)}/yr`;
    mInput.value = newMonthly;
    yInput.value = newYearly;
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
  div.appendChild(mMeal);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(yInput);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(yMeal);
  return div;
}

async function init() {
  container = document.getElementById('plans');
  const [needs, consumption, mealData] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadMealPlanData()
  ]);
  allNeeds = sortItemsByCategory(needs);
  needsMap = new Map(needs.map(n => [n.name, n]));
  consMap = new Map(consumption.map(c => [c.name, c]));
  mealYearMap = new Map((mealData.yearly || []).map(m => [m.name, m.total_needed_year]));
  mealMonthMap = new Map((mealData.monthly || []).map(m => [m.name, m.monthly_consumption]));

  function render() {
    const arr = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    container.innerHTML = '';
    renderItemsWithCategoryHeaders(
      arr,
      container,
      item =>
        createRow(
          item,
          needsMap,
          consMap,
          mealYearMap,
          mealMonthMap,
          needs,
          consumption
        ),
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


import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import { loadMealPlanData } from './utils/mealNeedsCalculator.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const MODE_KEY = 'planEntryMode';

let filterText = '';
const headerState = {};
let allNeeds = [];
let needsMap;
let mealYearMap;
let container;
let planMode = 'yearly';

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

function loadMode() {
  return new Promise(resolve => {
    chrome.storage.local.get([MODE_KEY], data => {
      resolve(data[MODE_KEY] || 'yearly');
    });
  });
}

function saveNeeds(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ yearlyNeeds: arr }, () => resolve());
  });
}

function createRow(item, needsMap, mealYearMap, needsArr) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  const yearlyUser = needsMap.get(item.name)?.total_needed_year || 0;
  const yearlyMeal = mealYearMap.get(item.name) || 0;
  span.textContent = `${item.name} - ${(yearlyUser + yearlyMeal).toFixed(2)}/yr`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  if (planMode === 'monthly') {
    input.placeholder = 'Monthly Need';
    input.value = (yearlyUser / 12).toFixed(2);
  } else {
    input.placeholder = 'Yearly Need';
    input.value = yearlyUser;
  }

  async function commit() {
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      let rec = needsMap.get(item.name);
      if (rec) {
        rec.total_needed_year = planMode === 'monthly' ? val * 12 : val;
      }
    }
    const newYearly = needsMap.get(item.name)?.total_needed_year || 0;
    span.textContent = `${item.name} - ${(newYearly + yearlyMeal).toFixed(2)}/yr`;
    input.value = planMode === 'monthly' ? (newYearly / 12).toFixed(2) : newYearly;
    await saveNeeds(needsArr);
    try {
      chrome.runtime.sendMessage({ type: 'inventory-updated' });
    } catch (_) {}
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
  });

  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);
  return div;
}

async function init() {
  container = document.getElementById('plans');
  const [needs, mealData, mode] = await Promise.all([
    loadNeeds(),
    loadMealPlanData(),
    loadMode()
  ]);
  planMode = mode;
  allNeeds = sortItemsByCategory(needs);
  needsMap = new Map(needs.map(n => [n.name, n]));
  mealYearMap = new Map((mealData.yearly || []).map(m => [m.name, m.total_needed_year]));

  function render() {
    const arr = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    container.innerHTML = '';
    renderItemsWithCategoryHeaders(
      arr,
      container,
      item => createRow(item, needsMap, mealYearMap, needs),
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

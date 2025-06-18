import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const KEY = 'yearlyNeeds';

function loadNeeds() {
  return new Promise(async resolve => {
    chrome.storage.local.get(KEY, async data => {
      if (data[KEY]) {
        resolve(data[KEY]);
      } else {
        const arr = await loadJSON(NEEDS_PATH);
        resolve(arr);
      }
    });
  });
}

function saveNeeds(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [KEY]: arr }, () => resolve());
  });
}

function createRow(item, needs) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  const weekly = item.total_needed_year ? item.total_needed_year / 52 : 0;
  span.textContent = `${item.name} - ${weekly.toFixed(2)} /wk`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'Per week';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        item.total_needed_year = val * 52;
        span.textContent = `${item.name} - ${val.toFixed(2)} /wk`;
        input.value = '';
        await saveNeeds(needs);
      }
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);
  return div;
}

async function init() {
  const needs = await loadNeeds();
  const sorted = sortItemsByCategory(needs);
  const container = document.getElementById('plan');
  renderItemsWithCategoryHeaders(sorted, container, item => createRow(item, needs));
}

document.addEventListener('DOMContentLoaded', init);

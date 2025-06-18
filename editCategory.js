import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const NEEDS_KEY = 'yearlyNeeds';

function loadNeeds() {
  return new Promise(async resolve => {
    chrome.storage.local.get(NEEDS_KEY, async data => {
      if (data[NEEDS_KEY]) {
        resolve(data[NEEDS_KEY]);
      } else {
        const arr = await loadJSON(NEEDS_PATH);
        resolve(arr);
      }
    });
  });
}

function saveNeeds(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [NEEDS_KEY]: arr }, () => resolve());
  });
}

function createRow(item, needs) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = `${item.name} - ${item.category || ''}`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Category';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      const rec = needs.find(n => n.name === item.name);
      if (rec) {
        rec.category = val;
        span.textContent = `${item.name} - ${val}`;
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
  const container = document.getElementById('categories');
  renderItemsWithCategoryHeaders(sorted, container, item => createRow(item, needs));
}

document.addEventListener('DOMContentLoaded', init);

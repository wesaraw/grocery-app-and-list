import { loadJSON } from './utils/dataLoader.js';
import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';

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
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);

function saveExpiration(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ expirationData: arr }, () => resolve());
  });
}

function weeksFromMonths(months) {
  return months * 4.33;
}

function monthsFromWeeks(weeks) {
  return weeks / 4.33;
}

function createRow(item, expMap, expArr) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  const rec = expMap.get(item.name);
  const weeks = rec ? weeksFromMonths(rec.shelf_life_months) : 52;
  span.textContent = `${item.name} - ${weeks.toFixed(1)} w`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'Weeks';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        let record = expMap.get(item.name);
        if (!record) {
          record = { name: item.name, shelf_life_months: monthsFromWeeks(val) };
          expArr.push(record);
          expMap.set(item.name, record);
        } else {
          record.shelf_life_months = monthsFromWeeks(val);
        }
        span.textContent = `${item.name} - ${val.toFixed(1)} w`;
        input.value = '';
        await saveExpiration(expArr);
      }
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);

  return div;
}

async function init() {
  const [needs, expiration] = await Promise.all([loadNeeds(), loadExpiration()]);
  const sortedNeeds = sortItemsByCategory(needs);
  const expMap = new Map(expiration.map(e => [e.name, e]));
  const container = document.getElementById('expirations');
  renderItemsWithCategoryHeaders(sortedNeeds, container, n =>
    createRow(n, expMap, expiration)
  );
}

document.addEventListener('DOMContentLoaded', init);

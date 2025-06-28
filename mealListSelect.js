import { MEAL_TYPES } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { openOrFocusWindow } from './utils/windowUtils.js';

function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
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

async function renderButtons() {
  const div = document.getElementById('listButtons');
  div.innerHTML = '';
  for (const type of Object.keys(MEAL_TYPES)) {
    const meals = await loadMeals(type);
    const active = meals.filter(m => m.active !== false).length;
    const btn = document.createElement('button');
    btn.textContent = `${MEAL_TYPES[type].label} (${active})`;
    btn.addEventListener('click', () => {
      openOrFocusWindow(`mealListView.html?type=${type}`);
    });
    div.appendChild(btn);
  }
}

async function init() {
  await renderButtons();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      const changed = Object.values(MEAL_TYPES).some(t => changes[t.key]);
      if (changed) renderButtons();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

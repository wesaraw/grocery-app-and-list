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

async function init() {
  const div = document.getElementById('listButtons');
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

document.addEventListener('DOMContentLoaded', init);

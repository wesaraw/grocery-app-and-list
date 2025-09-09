import { get, set } from '../services/storageService.js';
import { MEAL_CATEGORIES, DEFAULT_MEALS_PER_DAY } from './constants.js';
import { calculateMealNeeds } from '../meal-planner/index.js';

// Exposed hook to allow tests to stub the meal math call.
const hooks = { calculateMealNeeds: calculateMealNeeds };

async function loadMultipliers() {
  const stored = await get('meal-per-day');
  const map = {};
  if (Array.isArray(stored)) {
    for (const entry of stored) map[entry.id] = entry.mealsPerDay;
  }
  return { ...DEFAULT_MEALS_PER_DAY, ...map };
}

async function saveMultipliers(map) {
  const arr = Object.entries(map).map(([id, mealsPerDay]) => ({
    id,
    mealsPerDay,
    version: 1
  }));
  await set('meal-per-day', arr);
}

async function renderMultiplier(root) {
  const multipliers = await loadMultipliers();
  root.innerHTML = '';
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Category</th><th>Current</th><th>Edit</th></tr>';
  const tbody = document.createElement('tbody');

  MEAL_CATEGORIES.forEach(cat => {
    const tr = document.createElement('tr');
    const labelTd = document.createElement('td');
    labelTd.textContent = cat.label;
    const curTd = document.createElement('td');
    curTd.textContent = multipliers[cat.id];
    const inputTd = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.value = multipliers[cat.id];
    input.addEventListener('change', async () => {
      const val = parseFloat(input.value);
      if (!Number.isNaN(val)) {
        multipliers[cat.id] = val;
        curTd.textContent = val;
        await saveMultipliers(multipliers);
        await hooks.calculateMealNeeds();
      }
    });
    inputTd.appendChild(input);
    tr.append(labelTd, curTd, inputTd);
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  root.appendChild(table);
}

export { hooks, renderMultiplier };
//# sourceMappingURL=index.js.map

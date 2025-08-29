import { openOrFocusWindow } from './utils/windowUtils.js';
import {
  loadUsers,
  loadUserPriceThresholds,
  saveUserPriceThresholds
} from './utils/userData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { importMealsFromFiles } from './mealImport.js';

document.getElementById('openLists').addEventListener('click', () => {
  openOrFocusWindow('mealListSelect.html');
});

document.getElementById('openUsers').addEventListener('click', () => {
  openOrFocusWindow('users.html');
});

document.getElementById('openCooking').addEventListener('click', () => {
  openOrFocusWindow('cookingDays.html');
});

document.getElementById('openCalendar').addEventListener('click', () => {
  openOrFocusWindow('whatToEatCalendar.html');
});

document.getElementById('importMeals').addEventListener('click', () => {
  document.getElementById('mealFiles').click();
});

document.getElementById('mealFiles').addEventListener('change', e => {
  const files = e.target.files;
  if (files && files.length) importMealsFromFiles(files);
  e.target.value = '';
});

async function initThresholdControls() {
  const users = await loadUsers();
  const thresholds = await loadUserPriceThresholds();

  const userSel = document.getElementById('thresholdUser');
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    userSel.appendChild(opt);
  });
  if (users.length) userSel.value = users[0];

  const input = document.getElementById('priceThreshold');

  function updateInput() {
    const user = userSel.value;
    const val = thresholds[user];
    input.value = val !== undefined ? val : '';
  }

  userSel.addEventListener('change', updateInput);
  updateInput();

  document.getElementById('saveThresholdBtn').addEventListener('click', async () => {
    const user = userSel.value;
    const val = parseFloat(input.value);
    if (!isNaN(val)) thresholds[user] = val;
    else delete thresholds[user];
    await saveUserPriceThresholds(thresholds);
    await calculateAndSaveMealNeeds();
  });

  document.getElementById('rebuildCalendarBtn').addEventListener('click', async () => {
    await calculateAndSaveMealNeeds();
  });
}

document.addEventListener('DOMContentLoaded', initThresholdControls);

import { openOrFocusWindow } from './utils/windowUtils.js';
import {
  loadUsers,
  loadUserPriceThresholds,
  saveUserPriceThresholds
} from './utils/userData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';

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

  const rebuildBtn = document.getElementById('rebuildCalendarBtn');
  const resyncBtn = document.getElementById('resyncCalendarBtn');

  function setButtonsDisabled(disabled) {
    rebuildBtn.disabled = disabled;
    resyncBtn.disabled = disabled;
  }

  async function runCalendarBuild(options, button, loadingLabel) {
    if (rebuildBtn.disabled || resyncBtn.disabled) return;
    setButtonsDisabled(true);
    const originalText = button.textContent;
    button.textContent = loadingLabel;
    try {
      await calculateAndSaveMealNeeds(options);
    } finally {
      button.textContent = originalText;
      setButtonsDisabled(false);
    }
  }

  rebuildBtn.addEventListener('click', () => runCalendarBuild(undefined, rebuildBtn, 'Rebuilding…'));
  resyncBtn.addEventListener('click', () => runCalendarBuild({ resync: true }, resyncBtn, 'Resyncing…'));
}

document.addEventListener('DOMContentLoaded', initThresholdControls);

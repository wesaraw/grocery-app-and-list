import { openOrFocusWindow } from './utils/windowUtils.js';
import {
  loadUsers,
  loadUserPriceThresholds,
  saveUserPriceThresholds
} from './utils/userData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { importMealsFromFiles } from './mealImport.js';

const importProgressContainer = document.getElementById('importProgress');
const importProgressBar = document.getElementById('importProgressBar');
const importProgressText = document.getElementById('importProgressText');

function showPreparingImport() {
  importProgressContainer.style.display = 'block';
  importProgressBar.value = 0;
  importProgressBar.max = 1;
  importProgressText.textContent = 'Preparing import…';
}

function updateImportProgress(completed, total) {
  const safeTotal = total > 0 ? total : 1;
  importProgressBar.max = safeTotal;
  importProgressBar.value = Math.min(completed, safeTotal);
  if (total > 0) {
    importProgressText.textContent = `${completed} of ${total} meals imported`;
  } else {
    importProgressText.textContent = 'No meals found in the selected XML.';
  }
}

function resetImportProgress() {
  importProgressContainer.style.display = 'none';
  importProgressBar.value = 0;
  importProgressBar.max = 1;
  importProgressText.textContent = '';
}

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

document.getElementById('mealFiles').addEventListener('change', async e => {
  const files = e.target.files;
  if (files && files.length) {
    showPreparingImport();
    try {
      const result = await importMealsFromFiles(files, {
        onStart(total) {
          updateImportProgress(0, total);
        },
        onProgress(completed, total) {
          updateImportProgress(completed, total);
        }
      });

      if (!result.total) {
        alert('No meals were found in the provided XML file.');
      } else if (result.errors.length) {
        const firstError = result.errors[0];
        const firstErrorMessage = firstError.error?.message || String(firstError.error);
        alert(
          `Imported ${result.successCount} of ${result.total} meals. ` +
            `First error: ${firstError.meal.name} – ${firstErrorMessage}`
        );
      } else {
        alert(`Successfully imported ${result.successCount} meals.`);
      }
    } catch (err) {
      const message = err?.message || String(err);
      alert(`Meal import failed: ${message}`);
    } finally {
      resetImportProgress();
    }
  }
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

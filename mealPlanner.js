import { openOrFocusWindow } from './utils/windowUtils.js';
import {
  loadUsers,
  loadUserPriceThresholds,
  saveUserPriceThresholds
} from './utils/userData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { importMealsFromFiles, importMealFromMealime } from './mealImport.js';
import { normalizeIngredientList } from './mealime/ingredientNormalizer.js';
import { mergeStepQuantities } from './mealime/stepQuantityMerger.js';

const MEALIME_CONTEXT_KEY = 'mealimeImportContext';
const MEALIME_DEFAULT_CATEGORY = 'lunchDinner';
const MEALIME_SOURCE_LABEL = 'Mealime';

const importProgressContainer = document.getElementById('importProgress');
const importProgressBar = document.getElementById('importProgressBar');
const importProgressText = document.getElementById('importProgressText');
const mealimeInput = document.getElementById('mealimeInput');
const mealimeImportBtn = document.getElementById('mealimeImportBtn');
const mealimeConfirmBtn = document.getElementById('mealimeConfirmBtn');
const mealimeStatusEl = document.getElementById('mealimeStatus');
const mealimeSummaryEl = document.getElementById('mealimeSummary');
const mealimeTitleEl = document.getElementById('mealimeRecipeTitle');
const mealimeMetaEl = document.getElementById('mealimeRecipeMeta');
const mealimeWarningsEl = document.getElementById('mealimeWarnings');
const mealimeWarningListEl = document.getElementById('mealimeWarningList');
const mealimeSourceLink = document.getElementById('mealimeRecipeSource');
const mealimeSourceContainer = document.getElementById('mealimeSourceContainer');
const mealimeCategorySelect = document.getElementById('mealimeCategory');

let pendingMealimeImport = null;

function getMealimeCategoryLabel(categoryId) {
  if (categoryId && MEAL_TYPES[categoryId]) {
    return MEAL_TYPES[categoryId].label || categoryId;
  }
  if (typeof categoryId === 'string' && categoryId.length) {
    return categoryId.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  }
  return MEAL_TYPES[MEALIME_DEFAULT_CATEGORY]?.label || 'Lunch/Dinner';
}

function getSelectedMealimeCategory() {
  const value = mealimeCategorySelect?.value;
  if (value && MEAL_TYPES[value]) {
    return value;
  }
  if (MEAL_TYPES[MEALIME_DEFAULT_CATEGORY]) {
    return MEALIME_DEFAULT_CATEGORY;
  }
  const firstKey = Object.keys(MEAL_TYPES)[0];
  return firstKey || MEALIME_DEFAULT_CATEGORY;
}

function populateMealimeCategoryOptions() {
  if (!mealimeCategorySelect) return;
  const previousValue = mealimeCategorySelect.value;
  mealimeCategorySelect.innerHTML = '';
  Object.entries(MEAL_TYPES).forEach(([categoryId, info]) => {
    const option = document.createElement('option');
    option.value = categoryId;
    option.textContent = info?.label || categoryId;
    mealimeCategorySelect.appendChild(option);
  });
  const defaultValue = MEAL_TYPES[previousValue]
    ? previousValue
    : (MEAL_TYPES[MEALIME_DEFAULT_CATEGORY] ? MEALIME_DEFAULT_CATEGORY : mealimeCategorySelect.options[0]?.value);
  if (defaultValue) {
    mealimeCategorySelect.value = defaultValue;
  }
}

async function initMealimeCategorySelect() {
  if (!mealimeCategorySelect) return;
  await initializeMealCategories();
  populateMealimeCategoryOptions();
}

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

function setMealimeStatus(message, isError = false) {
  if (!mealimeStatusEl) return;
  mealimeStatusEl.textContent = message || '';
  mealimeStatusEl.style.color = isError ? '#b3261e' : '#333';
}

function setMealimeControlsDisabled(disabled) {
  if (mealimeImportBtn) {
    mealimeImportBtn.disabled = !!disabled;
  }
  if (mealimeInput && !disabled) {
    mealimeInput.disabled = false;
  }
  if (mealimeCategorySelect) {
    mealimeCategorySelect.disabled = !!disabled;
  }
}

function hideMealimeSummary() {
  if (mealimeSummaryEl) {
    mealimeSummaryEl.style.display = 'none';
  }
  if (mealimeWarningsEl) {
    mealimeWarningsEl.style.display = 'none';
  }
  if (mealimeWarningListEl) {
    mealimeWarningListEl.innerHTML = '';
  }
  if (mealimeSourceContainer) {
    mealimeSourceContainer.style.display = 'none';
  }
  if (mealimeConfirmBtn) {
    mealimeConfirmBtn.style.display = 'none';
    mealimeConfirmBtn.disabled = false;
  }
  if (pendingMealimeImport) {
    pendingMealimeImport.summary = null;
  }
}

function renderMealimeWarnings(warnings = []) {
  if (!mealimeWarningsEl || !mealimeWarningListEl) return;
  mealimeWarningListEl.innerHTML = '';
  const items = (warnings || []).filter(Boolean);
  if (!items.length) {
    mealimeWarningsEl.style.display = 'none';
    return;
  }
  items.forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    mealimeWarningListEl.appendChild(li);
  });
  mealimeWarningsEl.style.display = 'block';
}

function sanitizeMealimeServings(value) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return 1;
}

function formatIngredientWarningEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  const ingredient = entry.ingredient || entry.token || '';
  if (entry.reason && ingredient) {
    return `Unable to parse ${entry.reason} for "${ingredient}".`;
  }
  if (entry.reason) return entry.reason;
  if (ingredient) return `Issue detected for "${ingredient}".`;
  return null;
}

function dedupeWarnings(warnings = []) {
  const seen = new Set();
  const unique = [];
  warnings.forEach(warning => {
    const text = typeof warning === 'string' ? warning.trim() : '';
    if (!text || seen.has(text)) return;
    seen.add(text);
    unique.push(text);
  });
  return unique;
}

function buildMealimeMeal(payload = {}, categoryId = getSelectedMealimeCategory()) {
  const parserWarnings = Array.isArray(payload.warnings) ? payload.warnings.filter(Boolean) : [];
  const { ingredients, warnings: ingredientWarnings } = normalizeIngredientList(payload.rawIngredients || []);
  const stepMerge = mergeStepQuantities(payload.rawSteps || [], ingredients);
  const ingredientWarningMessages = ingredientWarnings
    .map(formatIngredientWarningEntry)
    .filter(Boolean);
  const discrepancyWarnings = Array.isArray(stepMerge.discrepancies)
    ? stepMerge.discrepancies.map(d => d.reason).filter(Boolean)
    : [];
  const warnings = dedupeWarnings([
    ...parserWarnings,
    ...ingredientWarningMessages,
    ...(Array.isArray(stepMerge.warnings) ? stepMerge.warnings : []),
    ...discrepancyWarnings,
  ]);
  const servings = sanitizeMealimeServings(payload.servings);
  const title = payload.title || 'Mealime Recipe';
  const time = typeof payload.time === 'string' ? payload.time : '';
  const sourceUrl = typeof payload.sourceUrl === 'string' ? payload.sourceUrl : '';
  const instructions = stepMerge.instructions || (Array.isArray(payload.rawSteps) ? payload.rawSteps.join('\n\n') : '');
  const recipeBook = time ? `${MEALIME_SOURCE_LABEL} – ${time}` : MEALIME_SOURCE_LABEL;
  const selectedCategory = MEAL_TYPES[categoryId] ? categoryId : MEALIME_DEFAULT_CATEGORY;
  const categoryLabel = getMealimeCategoryLabel(selectedCategory);
  const meal = {
    category: selectedCategory,
    name: title,
    ingredients,
    instructions,
    recipeBook,
    cookTime: time,
    time,
    sourceUrl,
    totalPortions: servings,
    importWarnings: warnings,
  };
  return {
    meal,
    summary: {
      title,
      time,
      servings,
      warnings,
      sourceUrl,
      categoryId: selectedCategory,
      categoryLabel,
    },
  };
}

function renderMealimeSummary(summary) {
  if (!summary || !mealimeSummaryEl) return;
  mealimeSummaryEl.style.display = 'block';
  if (mealimeTitleEl) {
    mealimeTitleEl.textContent = summary.title || MEALIME_SOURCE_LABEL;
  }
  if (mealimeMetaEl) {
    const metaParts = [];
    if (summary.servings) {
      metaParts.push(`${summary.servings} servings`);
    }
    if (summary.time) {
      metaParts.push(summary.time);
    }
    if (summary.categoryLabel) {
      metaParts.push(`Category: ${summary.categoryLabel}`);
    }
    mealimeMetaEl.textContent = metaParts.join(' • ');
  }
  if (summary.sourceUrl && mealimeSourceLink && mealimeSourceContainer) {
    mealimeSourceLink.href = summary.sourceUrl;
    mealimeSourceLink.textContent = 'Open recipe in Mealime';
    mealimeSourceContainer.style.display = 'block';
  } else if (mealimeSourceContainer) {
    mealimeSourceContainer.style.display = 'none';
  }
  renderMealimeWarnings(summary.warnings);
  if (mealimeConfirmBtn) {
    mealimeConfirmBtn.style.display = 'block';
    mealimeConfirmBtn.disabled = false;
  }
}

function buildMealimePrintUrl(input) {
  const raw = (input || '').trim();
  if (!raw) {
    throw new Error('Enter a Mealime recipe URL or numeric ID.');
  }
  if (/^\d+$/.test(raw)) {
    return `https://app.mealime.com/recipe_variants/${raw}/print`;
  }
  let url;
  try {
    url = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`);
  } catch (error) {
    throw new Error('Enter a valid Mealime print URL or recipe ID.');
  }
  url.protocol = 'https:';
  const hostname = url.hostname.toLowerCase();
  if (hostname !== 'app.mealime.com') {
    throw new Error('Mealime URL must point to app.mealime.com.');
  }
  if (!/\/recipe_variants\/(\d+)/.test(url.pathname)) {
    throw new Error('Mealime URL must include a recipe variant ID.');
  }
  if (!/\/print\/?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/?$/, '/print');
  }
  url.hash = '';
  url.search = '';
  return url.toString();
}

function setMealimeContext(context) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [MEALIME_CONTEXT_KEY]: context }, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve();
      }
    });
  });
}

function clearMealimeContext() {
  return new Promise(resolve => {
    chrome.storage.local.remove(MEALIME_CONTEXT_KEY, () => resolve());
  });
}

function closeMealimeTab(tabId) {
  if (!tabId || !chrome?.tabs?.remove) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    chrome.tabs.remove(tabId, () => resolve());
  });
}

function openMealimeTab(url, requestId) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'openMealimeTab', url, requestId }, response => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      if (!response || typeof response.tabId !== 'number') {
        reject(new Error(response?.error || 'Mealime tab could not be opened.'));
        return;
      }
      resolve(response.tabId);
    });
  });
}

async function discardMealimeImportState({ keepSummary = false } = {}) {
  if (pendingMealimeImport?.tabId) {
    await closeMealimeTab(pendingMealimeImport.tabId);
  }
  pendingMealimeImport = null;
  await clearMealimeContext();
  if (!keepSummary) {
    hideMealimeSummary();
  }
}

async function startMealimeImport() {
  if (!mealimeInput) return;
  const value = mealimeInput.value || '';
  const selectedCategory = getSelectedMealimeCategory();
  try {
    hideMealimeSummary();
    await discardMealimeImportState({ keepSummary: true });
    const url = buildMealimePrintUrl(value);
    const requestId = `mealime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    pendingMealimeImport = {
      requestId,
      url,
      state: 'waiting',
      tabId: null,
      preparedMeal: null,
      selectedCategory,
      summary: null,
    };
    setMealimeControlsDisabled(true);
    setMealimeStatus('Opening Mealime recipe…');
    await setMealimeContext({ requestId, expectedUrl: url, startedAt: Date.now() });
    const tabId = await openMealimeTab(url, requestId);
    pendingMealimeImport.tabId = tabId;
    setMealimeStatus('Waiting for Mealime page to finish loading…');
  } catch (error) {
    await clearMealimeContext().catch(() => {});
    pendingMealimeImport = null;
    setMealimeControlsDisabled(false);
    setMealimeStatus(`Mealime import failed: ${error?.message || error}`, true);
  }
}

async function confirmMealimeImport() {
  if (!pendingMealimeImport?.preparedMeal) return;
  if (mealimeConfirmBtn) {
    mealimeConfirmBtn.disabled = true;
  }
  const selectedCategory = getSelectedMealimeCategory();
  pendingMealimeImport.selectedCategory = selectedCategory;
  pendingMealimeImport.preparedMeal.category = selectedCategory;
  setMealimeStatus('Adding recipe to your meals…');
  try {
    const summary = await importMealFromMealime(pendingMealimeImport.preparedMeal);
    setMealimeStatus(`Imported "${summary.name}" (${summary.totalPortions} servings).`);
    pendingMealimeImport = null;
    hideMealimeSummary();
  } catch (error) {
    setMealimeStatus(`Failed to import Mealime recipe: ${error?.message || error}`, true);
    if (mealimeConfirmBtn) {
      mealimeConfirmBtn.disabled = false;
    }
  }
}

async function handleMealimePayload(payload) {
  if (!pendingMealimeImport) return;
  const matchesRequest = payload?.requestId ? payload.requestId === pendingMealimeImport.requestId : true;
  if (!matchesRequest) return;
  if (pendingMealimeImport.tabId) {
    await closeMealimeTab(pendingMealimeImport.tabId);
    pendingMealimeImport.tabId = null;
  }
  try {
    const targetCategory = pendingMealimeImport.selectedCategory || getSelectedMealimeCategory();
    const { meal, summary } = buildMealimeMeal(payload || {}, targetCategory);
    pendingMealimeImport.preparedMeal = meal;
    pendingMealimeImport.summary = summary;
    pendingMealimeImport.selectedCategory = meal.category;
    setMealimeControlsDisabled(false);
    renderMealimeSummary(summary);
    setMealimeStatus('Recipe parsed. Review the details below, then confirm to add it.');
    pendingMealimeImport.state = 'ready';
  } catch (error) {
    pendingMealimeImport = null;
    hideMealimeSummary();
    setMealimeControlsDisabled(false);
    setMealimeStatus(`Mealime parsing failed: ${error?.message || error}`, true);
  }
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

if (mealimeImportBtn) {
  mealimeImportBtn.addEventListener('click', () => {
    startMealimeImport();
  });
}

if (mealimeConfirmBtn) {
  mealimeConfirmBtn.addEventListener('click', () => {
    confirmMealimeImport();
  });
}

if (mealimeCategorySelect) {
  mealimeCategorySelect.addEventListener('change', () => {
    const newCategory = getSelectedMealimeCategory();
    if (pendingMealimeImport) {
      pendingMealimeImport.selectedCategory = newCategory;
      if (pendingMealimeImport.preparedMeal) {
        pendingMealimeImport.preparedMeal.category = newCategory;
      }
      if (pendingMealimeImport.summary) {
        pendingMealimeImport.summary = {
          ...pendingMealimeImport.summary,
          categoryId: newCategory,
          categoryLabel: getMealimeCategoryLabel(newCategory),
        };
        renderMealimeSummary(pendingMealimeImport.summary);
      }
    }
  });
}

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

  async function runCalendarBuild(options = {}, button, loadingLabel) {
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

  rebuildBtn.addEventListener('click', () =>
    runCalendarBuild({ forceNutrientRebuild: true }, rebuildBtn, 'Rebuilding…')
  );
  resyncBtn.addEventListener('click', () =>
    runCalendarBuild({ resync: true }, resyncBtn, 'Resyncing…')
  );
}

document.addEventListener('DOMContentLoaded', initThresholdControls);
document.addEventListener('DOMContentLoaded', initMealimeCategorySelect);

if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'mealimePageParsed') {
      Promise.resolve(handleMealimePayload(message.payload || message)).catch(error => {
        setMealimeStatus(`Mealime parsing failed: ${error?.message || error}`, true);
      });
    }
  });
}

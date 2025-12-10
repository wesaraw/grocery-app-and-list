import { openOrFocusWindow } from './utils/windowUtils.js';
import { MEAL_TYPES, initializeMealCategories, addMealCategory } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';

const backendFrame = document.getElementById('legacyMealPlannerBackend');
const backendStatus = document.getElementById('backendStatus');
const importModal = document.getElementById('importModal');
const importStatus = document.getElementById('importStatus');
const mealimeUrlInput = document.getElementById('mealimeUrlInput');
const mealimeCategorySelect = document.getElementById('mealimeCategorySelect');
const mealimeStatusBlock = document.getElementById('mealimeStatusBlock');
const mealimeSummaryCard = document.getElementById('mealimeSummaryCard');
const mealimeSummaryTitle = document.getElementById('mealimeSummaryTitle');
const mealimeSummaryMeta = document.getElementById('mealimeSummaryMeta');
const mealimeSummaryWarnings = document.getElementById('mealimeSummaryWarnings');
const mealListButtons = document.getElementById('mealListButtons');
const mealListPanel = document.getElementById('mealListsPanel');
const mealListScrim = document.getElementById('mealListsScrim');
const mealListInput = document.getElementById('mealListNewCategory');
const addMealListCategoryBtn = document.getElementById('addMealListCategory');
const openListsPanelBtn = document.getElementById('openListsPanel');
const closeListsPanelBtn = document.getElementById('closeMealListsPanel');

let importProgressObserver;
let mealimeStatusObserver;
let mealimeSummaryObserver;
let mealListStorageListenerRegistered = false;

function setBackendStatus(text, tone = 'neutral') {
  if (!backendStatus) return;
  backendStatus.textContent = text;
  backendStatus.className = `status-pill status-pill--${tone}`;
}

function getBackendDocument() {
  const doc = backendFrame?.contentDocument;
  if (doc?.readyState === 'complete') return doc;
  return null;
}

function waitForBackendReady() {
  return new Promise((resolve, reject) => {
    const readyDoc = getBackendDocument();
    if (readyDoc) {
      resolve(readyDoc);
      return;
    }

    if (!backendFrame) {
      reject(new Error('Legacy backend unavailable'));
      return;
    }

    const onLoad = () => {
      const doc = getBackendDocument();
      if (doc) resolve(doc);
      else reject(new Error('Legacy backend failed to load'));
    };
    const onError = () => reject(new Error('Legacy backend failed to load'));

    backendFrame.addEventListener('load', onLoad, { once: true });
    backendFrame.addEventListener('error', onError, { once: true });
  });
}

function setStatusBlock(el, text, tone = 'muted') {
  if (!el) return;
  const toneClass = tone === 'success' ? 'status-block--success' : tone === 'danger' ? 'status-block--danger' : '';
  el.textContent = text;
  el.className = `status-block ${toneClass}`.trim();
}

function triggerBackend(actionId) {
  if (!actionId) return;
  const invoke = () => {
    const doc = backendFrame?.contentDocument;
    const target = doc?.getElementById(actionId);
    if (target) {
      target.click();
    } else {
      openOrFocusWindow('mealPlanner.html');
    }
  };

  if (backendFrame?.contentDocument?.readyState === 'complete') {
    invoke();
  } else if (backendFrame) {
    backendFrame.addEventListener('load', invoke, { once: true });
  } else {
    openOrFocusWindow('mealPlanner.html');
  }
}

function wireBackendStatus() {
  if (!backendFrame) {
    setBackendStatus('Legacy backend unavailable', 'danger');
    return;
  }

  const updateReadyState = () => {
    const ready = backendFrame.contentDocument?.readyState;
    if (ready === 'complete') {
      setBackendStatus('Backend connected', 'success');
    }
  };

  backendFrame.addEventListener('load', updateReadyState, { once: true });
  backendFrame.addEventListener('error', () => {
    setBackendStatus('Backend failed to load', 'danger');
  }, { once: true });

  updateReadyState();
}

function wireActions() {
  document.querySelectorAll('[data-backend-action]').forEach(btn => {
    const action = btn.getAttribute('data-backend-action');
    btn.addEventListener('click', () => triggerBackend(action));
  });

  const openLegacyButtons = [document.getElementById('openLegacy')].filter(Boolean);

  openLegacyButtons.forEach(btn => {
    btn.addEventListener('click', () => openOrFocusWindow('mealPlanner.html'));
  });
}

function openMealListsPanel() {
  if (!mealListPanel || !mealListScrim) return;
  mealListPanel.classList.add('slide-panel--open');
  mealListPanel.setAttribute('aria-hidden', 'false');
  mealListScrim.classList.add('slide-scrim--active');
  mealListScrim.setAttribute('aria-hidden', 'false');
}

function closeMealListsPanel() {
  if (!mealListPanel || !mealListScrim) return;
  mealListPanel.classList.remove('slide-panel--open');
  mealListPanel.setAttribute('aria-hidden', 'true');
  mealListScrim.classList.remove('slide-scrim--active');
  mealListScrim.setAttribute('aria-hidden', 'true');
}

function wireMealListPanel() {
  openListsPanelBtn?.addEventListener('click', () => {
    openMealListsPanel();
  });

  closeListsPanelBtn?.addEventListener('click', closeMealListsPanel);
  mealListScrim?.addEventListener('click', closeMealListsPanel);
}

function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
  return new Promise((resolve) => {
    chrome.storage.local.get(key, async (data) => {
      let arr = data[key];
      if (!arr) arr = await loadJSON(path);
      if (Array.isArray(arr)) {
        arr.forEach((m) => {
          if (m.prepared === undefined) m.prepared = false;
          if (m.prepAhead === undefined) m.prepAhead = false;
          if (m.leftoverOk === undefined) m.leftoverOk = false;
          if (m.recipeBook === undefined) m.recipeBook = '';
          if (typeof m.instructions !== 'string') {
            m.instructions = '';
          } else {
            m.instructions = m.instructions.trim();
          }
          if (!Array.isArray(m.ingredients)) {
            m.ingredients = [];
          }
          m.ingredients.forEach((ing) => {
            if (!ing || typeof ing !== 'object') return;
            if (ing.prepAhead === undefined) ing.prepAhead = false;
          });
        });
      }
      resolve(arr || []);
    });
  });
}

async function renderMealListButtons() {
  if (!mealListButtons) return;
  mealListButtons.innerHTML = '';

  for (const type of Object.keys(MEAL_TYPES)) {
    const meals = await loadMeals(type);
    const active = meals.filter((m) => m.active !== false).length;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-btn';
    btn.textContent = `${MEAL_TYPES[type].label} (${active})`;
    btn.addEventListener('click', () => {
      openOrFocusWindow(`mealListView.html?type=${encodeURIComponent(type)}`);
    });

    mealListButtons.appendChild(btn);
  }
}

async function handleAddMealCategory() {
  if (!mealListInput) return;
  const value = mealListInput.value.trim();
  if (!value) return;

  await addMealCategory(value);
  mealListInput.value = '';
  await renderMealListButtons();
}

async function initMealListPanel() {
  if (!mealListPanel) return;
  await initializeMealCategories();
  await renderMealListButtons();
  wireMealListPanel();

  addMealListCategoryBtn?.addEventListener('click', handleAddMealCategory);
  mealListInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddMealCategory();
    }
  });

  if (!mealListStorageListenerRegistered) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        const changed = Object.values(MEAL_TYPES).some((t) => changes[t.key]);
        if (changed) renderMealListButtons();
      }
    });
    mealListStorageListenerRegistered = true;
  }
}

function updateImportStatusFromBackend() {
  const backendDoc = getBackendDocument();
  const progressContainer = backendDoc?.getElementById('importProgress');
  const progressText = backendDoc?.getElementById('importProgressText');
  const progressBar = backendDoc?.getElementById('importProgressBar');

  if (!progressContainer || !progressText || !progressBar) {
    setStatusBlock(importStatus, 'Legacy import controls unavailable.', 'danger');
    return;
  }

  const hidden = progressContainer.style.display === 'none' || progressContainer.hidden;
  if (hidden) {
    setStatusBlock(importStatus, 'Ready to start an import.');
    return;
  }

  const completed = Number(progressBar.value) || 0;
  const total = Number(progressBar.max) || 1;
  const percent = Math.min(100, Math.round((completed / total) * 100));
  const label = progressText.textContent?.trim() || 'Import running…';
  const done = percent >= 100;
  setStatusBlock(importStatus, `${label} (${percent}% complete)`, done ? 'success' : 'muted');
}

function observeImportProgress() {
  const backendDoc = getBackendDocument();
  const progressContainer = backendDoc?.getElementById('importProgress');
  const progressText = backendDoc?.getElementById('importProgressText');
  const progressBar = backendDoc?.getElementById('importProgressBar');

  if (!progressContainer || !progressText || !progressBar) return;
  updateImportStatusFromBackend();

  if (importProgressObserver) return;
  importProgressObserver = new MutationObserver(updateImportStatusFromBackend);
  importProgressObserver.observe(progressContainer, { attributes: true, attributeFilter: ['style', 'hidden'] });
  importProgressObserver.observe(progressText, { childList: true, subtree: true });
  importProgressObserver.observe(progressBar, { attributes: true, attributeFilter: ['value', 'max'] });
}

function syncMealimeCategoriesFromBackend() {
  const backendDoc = getBackendDocument();
  const backendSelect = backendDoc?.getElementById('mealimeCategory');
  if (!backendSelect || !mealimeCategorySelect) return false;

  mealimeCategorySelect.innerHTML = '';
  Array.from(backendSelect.options).forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.textContent;
    mealimeCategorySelect.appendChild(opt);
  });

  if (mealimeCategorySelect.options.length) {
    mealimeCategorySelect.value = backendSelect.value || mealimeCategorySelect.options[0].value;
  }

  return true;
}

function pushMealimeFieldsToBackend() {
  const backendDoc = getBackendDocument();
  const backendInput = backendDoc?.getElementById('mealimeInput');
  const backendSelect = backendDoc?.getElementById('mealimeCategory');
  if (!backendInput || !backendSelect) return false;

  backendInput.value = mealimeUrlInput?.value || '';
  backendInput.dispatchEvent(new Event('input', { bubbles: true }));

  if (mealimeCategorySelect && mealimeCategorySelect.value) {
    backendSelect.value = mealimeCategorySelect.value;
    backendSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

function syncMealimeStatusFromBackend() {
  const backendDoc = getBackendDocument();
  const statusEl = backendDoc?.getElementById('mealimeStatus');
  if (!statusEl) {
    setStatusBlock(mealimeStatusBlock, 'Mealime status unavailable from the importer.', 'danger');
    return;
  }

  const text = statusEl.textContent?.trim() || 'Waiting to start a Mealime import…';
  const tone = statusEl.style.color?.includes('#b3261e') ? 'danger' : 'muted';
  setStatusBlock(mealimeStatusBlock, text, tone);
}

function syncMealimeSummaryFromBackend() {
  const backendDoc = getBackendDocument();
  const summary = backendDoc?.getElementById('mealimeSummary');
  const title = backendDoc?.getElementById('mealimeRecipeTitle');
  const meta = backendDoc?.getElementById('mealimeRecipeMeta');
  const warnings = backendDoc?.getElementById('mealimeWarningList');
  const backendConfirmBtn = backendDoc?.getElementById('mealimeConfirmBtn');

  if (!summary || !title || !meta || !warnings || !mealimeSummaryCard || !mealimeSummaryTitle || !mealimeSummaryMeta || !mealimeSummaryWarnings) {
    return;
  }

  const visible = summary.style.display !== 'none';
  mealimeSummaryCard.hidden = !visible;
  if (!visible) {
    if (mealimeSummaryWarnings) mealimeSummaryWarnings.innerHTML = '';
    return;
  }

  mealimeSummaryTitle.textContent = title.textContent || '';
  mealimeSummaryMeta.textContent = meta.textContent || '';

  mealimeSummaryWarnings.innerHTML = '';
  Array.from(warnings.children).forEach(li => {
    const warning = document.createElement('li');
    warning.textContent = li.textContent || '';
    mealimeSummaryWarnings.appendChild(warning);
  });

  const newConfirm = document.getElementById('mealimeConfirm');
  if (newConfirm) {
    const allowConfirm = backendConfirmBtn?.style.display !== 'none';
    newConfirm.disabled = !allowConfirm;
  }
}

function observeMealimeStatus() {
  const backendDoc = getBackendDocument();
  const statusEl = backendDoc?.getElementById('mealimeStatus');
  const summary = backendDoc?.getElementById('mealimeSummary');
  const summaryContent = backendDoc?.getElementById('mealimeSummary');
  const warnings = backendDoc?.getElementById('mealimeWarningList');

  syncMealimeStatusFromBackend();
  syncMealimeSummaryFromBackend();

  if (!statusEl || !summary || !summaryContent || !warnings) return;

  if (!mealimeStatusObserver) {
    mealimeStatusObserver = new MutationObserver(syncMealimeStatusFromBackend);
    mealimeStatusObserver.observe(statusEl, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }

  if (!mealimeSummaryObserver) {
    mealimeSummaryObserver = new MutationObserver(syncMealimeSummaryFromBackend);
    mealimeSummaryObserver.observe(summary, { attributes: true, attributeFilter: ['style', 'hidden'] });
    mealimeSummaryObserver.observe(summaryContent, { childList: true, subtree: true });
    mealimeSummaryObserver.observe(warnings, { childList: true, subtree: true });
  }
}

function closeImportModal() {
  if (importModal) importModal.hidden = true;
}

async function openImportModal() {
  if (!importModal) return;
  importModal.hidden = false;
  setStatusBlock(importStatus, 'Connecting to importer…');
  setStatusBlock(mealimeStatusBlock, 'Connecting to importer…');

  try {
    await waitForBackendReady();
  } catch (error) {
    const message = error?.message || 'Legacy backend unavailable.';
    setStatusBlock(importStatus, message, 'danger');
    setStatusBlock(mealimeStatusBlock, message, 'danger');
    return;
  }

  const categoriesLoaded = syncMealimeCategoriesFromBackend();
  if (!categoriesLoaded) {
    setStatusBlock(mealimeStatusBlock, 'Unable to load Mealime categories from the importer.', 'danger');
  }

  observeImportProgress();
  observeMealimeStatus();
  setStatusBlock(importStatus, 'Ready to start an import.');
}

async function triggerFileImport() {
  try {
    await waitForBackendReady();
  } catch (error) {
    setStatusBlock(importStatus, error?.message || 'Legacy backend unavailable.', 'danger');
    return;
  }

  const backendDoc = getBackendDocument();
  const triggerBtn = backendDoc?.getElementById('importMeals');
  if (!triggerBtn) {
    setStatusBlock(importStatus, 'Legacy import button not found.', 'danger');
    return;
  }

  setStatusBlock(importStatus, 'Opening file picker…');
  triggerBtn.click();
}

async function handleMealimeFetch() {
  try {
    await waitForBackendReady();
  } catch (error) {
    setStatusBlock(mealimeStatusBlock, error?.message || 'Legacy backend unavailable.', 'danger');
    return;
  }

  const pushed = pushMealimeFieldsToBackend();
  if (!pushed) {
    setStatusBlock(mealimeStatusBlock, 'Unable to sync Mealime form to the importer.', 'danger');
    return;
  }

  const backendDoc = getBackendDocument();
  const fetchBtn = backendDoc?.getElementById('mealimeImportBtn');
  if (!fetchBtn) {
    setStatusBlock(mealimeStatusBlock, 'Mealime fetch action unavailable.', 'danger');
    return;
  }

  setStatusBlock(mealimeStatusBlock, 'Fetching recipe from Mealime…');
  fetchBtn.click();
  observeMealimeStatus();
}

async function handleMealimeConfirm() {
  try {
    await waitForBackendReady();
  } catch (error) {
    setStatusBlock(mealimeStatusBlock, error?.message || 'Legacy backend unavailable.', 'danger');
    return;
  }

  const pushed = pushMealimeFieldsToBackend();
  if (!pushed) {
    setStatusBlock(mealimeStatusBlock, 'Unable to sync Mealime form to the importer.', 'danger');
    return;
  }

  const backendDoc = getBackendDocument();
  const confirmBtn = backendDoc?.getElementById('mealimeConfirmBtn');
  if (!confirmBtn || confirmBtn.style.display === 'none') {
    setStatusBlock(mealimeStatusBlock, 'Confirm action is not ready yet.', 'danger');
    return;
  }

  setStatusBlock(mealimeStatusBlock, 'Adding recipe to meals…');
  confirmBtn.click();
  observeMealimeStatus();
}

function wireImportModal() {
  document.getElementById('openImport')?.addEventListener('click', openImportModal);
  document.querySelectorAll('[data-close-import]').forEach(el => {
    el.addEventListener('click', closeImportModal);
  });

  document.getElementById('triggerFileImport')?.addEventListener('click', triggerFileImport);
  document.getElementById('mealimeFetch')?.addEventListener('click', handleMealimeFetch);
  document.getElementById('mealimeConfirm')?.addEventListener('click', handleMealimeConfirm);

  mealimeCategorySelect?.addEventListener('change', () => {
    pushMealimeFieldsToBackend();
    syncMealimeStatusFromBackend();
  });

  mealimeUrlInput?.addEventListener('input', () => {
    pushMealimeFieldsToBackend();
  });
}

wireBackendStatus();
wireActions();
wireImportModal();
initMealListPanel();

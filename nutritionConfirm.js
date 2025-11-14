import {
  PENDING_MATCH_KEY,
  ACTIVE_PENDING_MATCH_KEY,
  getPendingMatch,
  removePendingMatch,
  setPendingMatch,
  getActivePendingMatchEntry,
  clearActivePendingMatchEntry
} from './utils/nutritionMatching.js';
import {
  persistIngredientSelection,
  searchFdcFoods,
  searchBrandedFoodsByBrand,
  rankCandidates,
  MissingFdcApiKeyError
} from './utils/fdcClient.js';
import { markIngredientNutritionExempt } from './utils/ingredientStorage.js';

let itemName = '';
let pendingMatch = null;
let selectedFdcId = null;
let activePendingEntry = null;
let searchInputEl = null;
let brandInputEl = null;
let searchButtonEl = null;
let searchSpinnerEl = null;
let searchStatusEl = null;
let skipButtonEl = null;
let notFoodButtonEl = null;
let markExemptInProgress = false;

function renderStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = `status ${type}`.trim();
}

function renderSearchStatus(message, type = 'info') {
  if (!searchStatusEl) return;
  if (!message) {
    searchStatusEl.textContent = '';
    searchStatusEl.className = 'status search-status';
    searchStatusEl.style.display = 'none';
    return;
  }
  searchStatusEl.textContent = message;
  searchStatusEl.className = `status search-status ${type}`.trim();
  searchStatusEl.style.display = 'block';
}

function setSearchLoading(loading) {
  const shouldDisable = loading || !pendingMatch;
  if (searchButtonEl) searchButtonEl.disabled = shouldDisable;
  if (searchInputEl) searchInputEl.disabled = shouldDisable;
  if (brandInputEl) brandInputEl.disabled = shouldDisable;
  if (searchSpinnerEl) {
    if (loading) {
      searchSpinnerEl.hidden = false;
    } else {
      searchSpinnerEl.hidden = true;
    }
  }
}

function enableConfirm(enabled) {
  const btn = document.getElementById('confirmBtn');
  if (btn) btn.disabled = !enabled;
}

function refreshActionButtons() {
  if (skipButtonEl) {
    skipButtonEl.disabled = !pendingMatch || markExemptInProgress;
  }
  if (notFoodButtonEl) {
    notFoodButtonEl.disabled = !pendingMatch || markExemptInProgress;
  }
  enableConfirm(!!pendingMatch && !!selectedFdcId && !markExemptInProgress);
}

function renderCandidates({ emptyMessage } = {}) {
  const container = document.getElementById('candidates');
  if (!container) return;
  container.innerHTML = '';
  selectedFdcId = null;
  if (!pendingMatch) {
    const empty = document.createElement('p');
    empty.textContent = emptyMessage || 'Waiting for the next item…';
    container.appendChild(empty);
    refreshActionButtons();
    return;
  }
  if (!pendingMatch.candidates?.length) {
    const empty = document.createElement('p');
    empty.textContent = emptyMessage || 'No candidate matches to display.';
    container.appendChild(empty);
    refreshActionButtons();
    return;
  }
  pendingMatch.candidates.forEach(candidate => {
    const wrapper = document.createElement('label');
    wrapper.className = 'candidate';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'candidate';
    input.value = candidate.fdcId;
    input.addEventListener('change', () => {
      selectedFdcId = candidate.fdcId;
      refreshActionButtons();
      renderStatus('');
    });

    const body = document.createElement('div');
    body.className = 'candidate-body';

    const header = document.createElement('header');
    header.textContent = candidate.description || 'Untitled food';

    const details = document.createElement('div');
    details.innerHTML = `
      <small>Data Type: ${candidate.dataType || '—'}</small>
      <small>Brand: ${candidate.brandOwner || '—'}</small>
      <small class="score">Score: ${(candidate.score * 100).toFixed(1)}%</small>
      ${candidate.householdServingFullText ? `<small>Portion: ${candidate.householdServingFullText}</small>` : ''}
    `;

    body.appendChild(header);
    body.appendChild(details);

    wrapper.appendChild(input);
    wrapper.appendChild(body);
    container.appendChild(wrapper);
  });
  refreshActionButtons();
}

function showAllCompleteState() {
  const itemEl = document.getElementById('itemName');
  if (itemEl) {
    itemEl.textContent = 'All matches complete';
  }
  pendingMatch = null;
  selectedFdcId = null;
  const container = document.getElementById('candidates');
  if (container) {
    container.innerHTML = '';
    const message = document.createElement('p');
    message.textContent = 'No ingredients currently require nutrition confirmation.';
    container.appendChild(message);
  }
  renderStatus('All pending matches have been processed.', 'success');
  renderSearchStatus('');
  setSearchLoading(false);
  if (searchInputEl) searchInputEl.value = '';
  if (brandInputEl) brandInputEl.value = '';
  refreshActionButtons();
}

async function applyActivePendingEntry(entry) {
  activePendingEntry = entry && entry.itemName ? { ...entry } : null;
  itemName = activePendingEntry?.itemName || '';
  if (!itemName) {
    showAllCompleteState();
    return;
  }
  await loadPending();
}

async function hydrateActiveEntry() {
  try {
    const entry = await getActivePendingMatchEntry();
    await applyActivePendingEntry(entry);
  } catch (err) {
    console.error('Unable to hydrate active pending match', err);
    showAllCompleteState();
    renderStatus('Unable to load pending matches.', 'error');
  }
}

function subscribeToStorageChanges() {
  if (!chrome || !chrome.storage || !chrome.storage.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes) return;
    if (changes[ACTIVE_PENDING_MATCH_KEY]) {
      applyActivePendingEntry(changes[ACTIVE_PENDING_MATCH_KEY].newValue || null).catch(err => {
        console.error('Unable to update active pending match', err);
      });
      return;
    }
    if (changes[PENDING_MATCH_KEY]) {
      const normalized = activePendingEntry?.normalizedName;
      if (!normalized) return;
      const newMap = changes[PENDING_MATCH_KEY].newValue || {};
      const oldMap = changes[PENDING_MATCH_KEY].oldValue || {};
      if ((newMap && newMap[normalized]) || (oldMap && oldMap[normalized])) {
        loadPending().catch(err => {
          console.error('Unable to refresh pending match', err);
        });
      }
    }
  });
}

async function loadPending() {
  if (!itemName) {
    showAllCompleteState();
    return;
  }
  const itemEl = document.getElementById('itemName');
  try {
    pendingMatch = await getPendingMatch(itemName);
  } catch (err) {
    console.error('Unable to load pending match', err);
    pendingMatch = null;
  }

  if (!pendingMatch) {
    if (itemEl) itemEl.textContent = itemName;
    renderStatus('Waiting for the next item…', 'info');
    renderCandidates({ emptyMessage: 'Waiting for the next item…' });
    setSearchLoading(false);
    renderSearchStatus('');
    if (searchInputEl) searchInputEl.value = '';
    if (brandInputEl) brandInputEl.value = '';
    refreshActionButtons();
    return;
  }

  if (itemEl) itemEl.textContent = pendingMatch.itemName || itemName;
  renderStatus('Select the best nutrition match for this item.');
  renderCandidates();
  setSearchLoading(false);
  renderSearchStatus('');
  if (searchInputEl) {
    searchInputEl.value = pendingMatch.lastSearchQuery || pendingMatch.itemName || itemName;
  }
  if (brandInputEl) {
    brandInputEl.value = pendingMatch.lastBrandQuery || '';
  }
  refreshActionButtons();
}

async function confirmSelection() {
  if (!pendingMatch || !selectedFdcId) return;
  const candidate = pendingMatch.candidates.find(c => c.fdcId === selectedFdcId);
  if (!candidate) {
    renderStatus('Please choose a candidate.', 'error');
    return;
  }
  enableConfirm(false);
  renderStatus('Saving selection…');
  try {
    await persistIngredientSelection(itemName, candidate, {
      unitDefault: pendingMatch.unitDefault || 'g',
      confidence: candidate.score
    });
    await removePendingMatch(itemName);
    await clearActivePendingMatchEntry();
    pendingMatch = null;
    selectedFdcId = null;
    renderStatus('Nutrition data saved. Loading next item…', 'success');
    renderSearchStatus('');
    renderCandidates({ emptyMessage: 'Waiting for the next item…' });
    setSearchLoading(false);
    refreshActionButtons();
  } catch (err) {
    console.error('Failed to persist selection', err);
    renderStatus('Failed to save selection. Please try again.', 'error');
    enableConfirm(true);
  }
}

async function skipSelection() {
  if (!pendingMatch) return;
  await removePendingMatch(itemName);
  await clearActivePendingMatchEntry();
  pendingMatch = null;
  selectedFdcId = null;
  renderStatus('Match skipped. Loading next item…', 'warning');
  renderSearchStatus('');
  renderCandidates({ emptyMessage: 'Waiting for the next item…' });
  setSearchLoading(false);
  refreshActionButtons();
}

async function markItemAsNotFood() {
  if (!pendingMatch || !itemName || markExemptInProgress) return;
  markExemptInProgress = true;
  refreshActionButtons();
  renderStatus('Marking item as not requiring nutrition data…');
  try {
    await markIngredientNutritionExempt(itemName);
    await removePendingMatch(itemName);
    await clearActivePendingMatchEntry();
    pendingMatch = null;
    selectedFdcId = null;
    renderStatus('Marked as not requiring nutrition. Loading next item…', 'success');
    renderSearchStatus('');
    renderCandidates({ emptyMessage: 'Waiting for the next item…' });
    setSearchLoading(false);
  } catch (err) {
    console.error('Unable to mark item as nutrition exempt', err);
    renderStatus('Failed to mark item as not requiring nutrition. Please try again.', 'error');
  } finally {
    markExemptInProgress = false;
    refreshActionButtons();
  }
}

async function handleSearch(event) {
  event.preventDefault();
  if (!pendingMatch) {
    renderSearchStatus('This item no longer requires confirmation.', 'warning');
    return;
  }

  const rawQuery = searchInputEl?.value?.trim();
  const query = rawQuery || pendingMatch.lastSearchQuery || pendingMatch.itemName || itemName;
  const brand = brandInputEl?.value?.trim() || '';
  if (!query) {
    renderSearchStatus('Enter a term to search.', 'warning');
    return;
  }

  if (searchInputEl) {
    searchInputEl.value = query;
  }
  if (brandInputEl) {
    brandInputEl.value = brand;
  }

  setSearchLoading(true);
  if (brand) {
    renderSearchStatus(`Searching "${query}" across brand names and owners matching "${brand}"…`);
  } else {
    renderSearchStatus('Searching high-quality USDA foods…');
  }
  try {
    const foods = brand
      ? await searchBrandedFoodsByBrand(query, brand, { pageSize: 25 })
      : await searchFdcFoods(query, { pageSize: 25 });
    const ranked = rankCandidates(pendingMatch.itemName || itemName || query, foods);
    const sanitized = ranked.map(candidate => {
      const { _original, ...rest } = candidate;
      return rest;
    });

    const nextMatch = {
      ...pendingMatch,
      itemName: pendingMatch.itemName || itemName,
      lastSearchQuery: query,
      lastBrandQuery: brand,
      updatedAt: new Date().toISOString()
    };
    if (sanitized.length) {
      nextMatch.candidates = sanitized;
    }

    await setPendingMatch(itemName, nextMatch);
    pendingMatch = await getPendingMatch(itemName);
    renderCandidates();

    const brandSuffix = brand ? ` for brand "${brand}"` : '';
    if (sanitized.length) {
      renderSearchStatus(
        `Showing ${sanitized.length} result${sanitized.length === 1 ? '' : 's'} for "${query}"${brandSuffix}.`,
        'success'
      );
    } else {
      renderSearchStatus(`No results found for "${query}"${brandSuffix}.`, 'warning');
    }
  } catch (err) {
    console.error('Nutrition search failed', err);
    if (err instanceof MissingFdcApiKeyError || err?.code === 'MISSING_FDC_API_KEY') {
      renderSearchStatus('Add your FDC website API key to search USDA foods.', 'error');
    } else {
      renderSearchStatus('Search failed. Please try again.', 'error');
    }
  } finally {
    setSearchLoading(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  searchInputEl = document.getElementById('searchInput');
  brandInputEl = document.getElementById('brandInput');
  searchButtonEl = document.getElementById('searchBtn');
  searchSpinnerEl = document.getElementById('searchSpinner');
  searchStatusEl = document.getElementById('searchStatus');
  skipButtonEl = document.getElementById('skipBtn');
  notFoodButtonEl = document.getElementById('markNotFoodBtn');
  renderSearchStatus('');
  setSearchLoading(false);
  refreshActionButtons();
  renderStatus('Loading pending matches…', 'info');

  hydrateActiveEntry();
  subscribeToStorageChanges();

  const confirmBtn = document.getElementById('confirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', confirmSelection);
  }
  if (skipButtonEl) {
    skipButtonEl.addEventListener('click', skipSelection);
  }
  if (notFoodButtonEl) {
    notFoodButtonEl.addEventListener('click', markItemAsNotFood);
  }
  const searchForm = document.getElementById('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', handleSearch);
  }
});

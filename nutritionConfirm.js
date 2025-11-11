import {
  getPendingMatch,
  removePendingMatch,
  setPendingMatch
} from './utils/nutritionMatching.js';
import {
  persistIngredientSelection,
  searchFdcFoods,
  rankCandidates,
  MissingFdcApiKeyError
} from './utils/fdcClient.js';

let itemName = '';
let pendingMatch = null;
let selectedFdcId = null;
let searchInputEl = null;
let searchButtonEl = null;
let searchSpinnerEl = null;
let searchStatusEl = null;

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
  if (searchButtonEl) searchButtonEl.disabled = loading;
  if (searchInputEl) searchInputEl.disabled = loading;
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

function renderCandidates() {
  const container = document.getElementById('candidates');
  container.innerHTML = '';
  selectedFdcId = null;
  if (!pendingMatch || !pendingMatch.candidates?.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No candidate matches to display.';
    container.appendChild(empty);
    enableConfirm(false);
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
      enableConfirm(true);
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
  enableConfirm(false);
}

async function loadPending() {
  pendingMatch = await getPendingMatch(itemName);
  const itemEl = document.getElementById('itemName');
  if (!pendingMatch) {
    itemEl.textContent = itemName || '';
    renderStatus('No pending matches for this item.', 'error');
    enableConfirm(false);
    if (searchInputEl) searchInputEl.disabled = true;
    if (searchButtonEl) searchButtonEl.disabled = true;
    if (searchSpinnerEl) searchSpinnerEl.hidden = true;
    renderSearchStatus('');
    return;
  }
  itemEl.textContent = pendingMatch.itemName || itemName;
  renderCandidates();
  setSearchLoading(false);
  if (searchInputEl) {
    searchInputEl.value = pendingMatch.lastSearchQuery || pendingMatch.itemName || itemName;
  }
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
    renderStatus('Nutrition data saved.', 'success');
    renderSearchStatus('');
    setTimeout(() => window.close(), 750);
  } catch (err) {
    console.error('Failed to persist selection', err);
    renderStatus('Failed to save selection. Please try again.', 'error');
    enableConfirm(true);
  }
}

async function skipSelection() {
  await removePendingMatch(itemName);
  renderStatus('Match skipped. You can retry from the inventory timeline.', 'warning');
  renderSearchStatus('');
  setTimeout(() => window.close(), 750);
}

async function handleSearch(event) {
  event.preventDefault();
  if (!pendingMatch) {
    renderSearchStatus('This item no longer requires confirmation.', 'warning');
    return;
  }

  const rawQuery = searchInputEl?.value?.trim();
  const query = rawQuery || pendingMatch.lastSearchQuery || pendingMatch.itemName || itemName;
  if (!query) {
    renderSearchStatus('Enter a term to search.', 'warning');
    return;
  }

  if (searchInputEl) {
    searchInputEl.value = query;
  }

  setSearchLoading(true);
  renderSearchStatus('Searching…');
  try {
    const foods = await searchFdcFoods(query, { pageSize: 25 });
    const ranked = rankCandidates(pendingMatch.itemName || itemName || query, foods);
    const sanitized = ranked.map(candidate => {
      const { _original, ...rest } = candidate;
      return rest;
    });

    const nextMatch = {
      ...pendingMatch,
      itemName: pendingMatch.itemName || itemName,
      lastSearchQuery: query,
      updatedAt: new Date().toISOString()
    };
    if (sanitized.length) {
      nextMatch.candidates = sanitized;
    }

    await setPendingMatch(itemName, nextMatch);
    pendingMatch = await getPendingMatch(itemName);
    renderCandidates();

    if (sanitized.length) {
      renderSearchStatus(`Showing ${sanitized.length} result${sanitized.length === 1 ? '' : 's'} for "${query}".`, 'success');
    } else {
      renderSearchStatus(`No results found for "${query}".`, 'warning');
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
  const params = new URLSearchParams(window.location.search);
  itemName = params.get('item') || '';
  if (!itemName) {
    renderStatus('No item specified.', 'error');
    return;
  }
  searchInputEl = document.getElementById('searchInput');
  searchButtonEl = document.getElementById('searchBtn');
  searchSpinnerEl = document.getElementById('searchSpinner');
  searchStatusEl = document.getElementById('searchStatus');
  renderSearchStatus('');

  loadPending();
  document.getElementById('confirmBtn').addEventListener('click', confirmSelection);
  document.getElementById('skipBtn').addEventListener('click', skipSelection);
  const searchForm = document.getElementById('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', handleSearch);
  }
});

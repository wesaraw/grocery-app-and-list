import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { canonicalName } from './utils/nameUtils.js';
import { getIngredientMap } from './utils/ingredientStorage.js';
import { tokenize, computeNameSimilarity } from './utils/textSimilarity.js';
import { loadJSON } from './utils/dataLoader.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadItemSeasons, saveItemSeasons } from './utils/seasonData.js';
import { loadPurchases, savePurchases } from './utils/purchaseStorage.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';
const SIMILARITY_THRESHOLD = 0.82;
const DISMISSED_PAIRS_KEY = 'dismissedDuplicatePairs';
const PENDING_DELETIONS_KEY = 'pendingItemDeletions';
const STATUS = {
  LEAVE: 'leave',
  MERGE: 'merge',
  BEST: 'best'
};

const state = {
  items: [],
  batches: [],
  filteredOrder: [],
  currentIndex: -1,
  searchTerm: '',
  searchResults: [],
  isScanning: false,
  isApplying: false,
  lastSnapshot: null,
  dismissedPairs: new Set(),
  pendingDeletionCandidates: [],
  deletionChoices: new Map(),
  isDeletionConfirming: false
};

const statusEl = document.getElementById('status');
const batchContainer = document.getElementById('batch-container');
const batchPosition = document.getElementById('batchPosition');
const prevBatchBtn = document.getElementById('prevBatch');
const nextBatchBtn = document.getElementById('nextBatch');
const applyBtn = document.getElementById('apply');
const undoBtn = document.getElementById('undo');
const rescanBtn = document.getElementById('rescan');
const searchBox = document.getElementById('searchBox');
const searchResultsContainer = document.getElementById('search-results');
const searchResultsList = document.getElementById('searchResultsList');
const deletionModal = document.getElementById('deletionModal');
const deletionList = document.getElementById('deletionList');
const confirmDeletionBtn = document.getElementById('confirmDeletion');
const cancelDeletionBtn = document.getElementById('cancelDeletion');

function setStatus(message) {
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function renderEmptyState(message) {
  if (!batchContainer) return;
  batchContainer.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'placeholder';
  p.textContent = message;
  batchContainer.appendChild(p);
}

async function loadNeeds() {
  const arr = await loadItemArray('yearlyNeeds');
  if (arr.length) return arr;
  const fallback = await loadJSON(YEARLY_NEEDS_PATH);
  return await convertArrayToNames(fallback);
}

async function loadFinalProducts(names) {
  return new Promise(resolve => {
    if (!names.length) {
      resolve({});
      return;
    }
    const keys = names.map(name => `final_product_${encodeURIComponent(name)}`);
    chrome.storage.local.get(keys, data => {
      const map = {};
      names.forEach((name, idx) => {
        map[name] = data[keys[idx]] || null;
      });
      resolve(map);
    });
  });
}

async function loadArrayWithFallback(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return await convertArrayToNames(fromJson);
}

const loadConsumption = () => loadArrayWithFallback('monthlyConsumption', CONSUMPTION_PATH);
const loadStock = () => loadArrayWithFallback('currentStock', STOCK_PATH);
const loadExpiration = () => loadArrayWithFallback('expirationData', EXPIRATION_PATH);
function loadDismissedPairStore() {
  return new Promise(resolve => {
    chrome.storage.local.get(DISMISSED_PAIRS_KEY, data => {
      const raw = data[DISMISSED_PAIRS_KEY];
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        resolve(raw);
      } else {
        resolve({});
      }
    });
  });
}

function persistDismissedPairs() {
  const payload = {};
  state.dismissedPairs.forEach(key => {
    payload[key] = true;
  });
  return new Promise(resolve => {
    chrome.storage.local.set({ [DISMISSED_PAIRS_KEY]: payload }, () => resolve());
  });
}

const pairKeyFromCanonicals = (a, b) => {
  if (!a || !b) return null;
  const [first, second] = [a, b].map(value => value || '').sort();
  return `${first}__${second}`;
};

function loadMealsForType({ key, path }) {
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      let arr = data[key];
      if (!arr) arr = await loadJSON(path);
      resolve(arr || []);
    });
  });
}

function loadConsumed() {
  return new Promise(resolve => {
    chrome.storage.local.get('consumedThisYear', data => {
      resolve(data.consumedThisYear || []);
    });
  });
}

function loadOverrides() {
  return new Promise(resolve => {
    chrome.storage.local.get('consumptionOverrides', data => {
      resolve(data.consumptionOverrides || {});
    });
  });
}

function loadHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get('consumedHistory', data => {
      resolve(data.consumedHistory || {});
    });
  });
}

function saveValue(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

function saveOverrides(overrides) {
  return new Promise(resolve => {
    chrome.storage.local.set({ consumptionOverrides: overrides }, () => resolve());
  });
}

function saveHistory(history) {
  return new Promise(resolve => {
    chrome.storage.local.set({ consumedHistory: history }, () => resolve());
  });
}

function queueItemDeletions(names) {
  if (!names.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(PENDING_DELETIONS_KEY, data => {
      const existing = Array.isArray(data[PENDING_DELETIONS_KEY]) ? data[PENDING_DELETIONS_KEY] : [];
      const merged = Array.from(new Set([...existing, ...names]));
      chrome.storage.local.set({ [PENDING_DELETIONS_KEY]: merged }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        try {
          chrome.runtime.sendMessage({ type: 'inventory-delete-items', names });
        } catch (_) {}
        resolve();
      });
    });
  });
}

function enrichItems(items, finalProducts, ingredientMap) {
  return items
    .filter(item => item && item.name)
    .map((item, index) => {
      const normalized = canonicalName(item.name);
      return {
        raw: item,
        id: `${normalized}-${index}`,
        index,
        name: item.name,
        canonical: normalized,
        category: item.category || '',
        home_unit: item.home_unit || item.unit || '',
        ingredient: ingredientMap[normalized] || null,
        product: finalProducts[item.name] || null,
        tokens: tokenize(item.name)
      };
    });
}

function buildDuplicateBatches(items, dismissedPairs = new Set()) {
  if (!items.length) return [];
  const parent = items.map((_, idx) => idx);
  const pairMeta = new Map();
  let batchCounter = 0;

  const isPairDismissed = (a, b) => {
    const key = pairKeyFromCanonicals(items[a]?.canonical, items[b]?.canonical);
    return key ? dismissedPairs.has(key) : false;
  };

  const find = idx => {
    if (parent[idx] !== idx) {
      parent[idx] = find(parent[idx]);
    }
    return parent[idx];
  };

  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    parent[rootB] = rootA;
  };

  const pairKey = (a, b) => {
    if (a === b) return `${a}-${b}`;
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  };

  const ensurePairMeta = (a, b) => {
    const key = pairKey(a, b);
    if (!pairMeta.has(key)) {
      pairMeta.set(key, { reasons: new Set(), similarity: null });
    }
    return pairMeta.get(key);
  };

  const noteReason = (a, b, reason) => {
    if (a === b || isPairDismissed(a, b)) return;
    const meta = ensurePairMeta(a, b);
    if (reason) meta.reasons.add(reason);
    union(a, b);
  };

  const recordSimilarity = (a, b, score) => {
    if (a === b || isPairDismissed(a, b)) return;
    const meta = ensurePairMeta(a, b);
    meta.similarity = Math.max(meta.similarity ?? 0, score);
    meta.reasons.add(`Name similarity ${(score * 100).toFixed(0)}%`);
    union(a, b);
  };

  const byCanonical = new Map();
  items.forEach((item, idx) => {
    const list = byCanonical.get(item.canonical) || [];
    list.push(idx);
    byCanonical.set(item.canonical, list);
  });
  byCanonical.forEach(list => {
    if (list.length <= 1) return;
    list.forEach((a, idx) => {
      for (let j = idx + 1; j < list.length; j++) {
        const b = list[j];
        noteReason(a, b, `Exact canonical match (“${items[a].name}”)`);
      }
    });
  });

  const byFdc = new Map();
  items.forEach((item, idx) => {
    const fdcId = item.ingredient?.fdc_id;
    if (!fdcId) return;
    const key = String(fdcId);
    const list = byFdc.get(key) || [];
    list.push(idx);
    byFdc.set(key, list);
  });
  byFdc.forEach((list, fdcId) => {
    if (list.length <= 1) return;
    list.forEach((a, idx) => {
      for (let j = idx + 1; j < list.length; j++) {
        const other = list[j];
        noteReason(a, other, `Share FDC ID ${fdcId}`);
      }
    });
  });

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (isPairDismissed(i, j)) continue;
      const score = computeNameSimilarity(items[i].name, items[j].name);
      if (score >= SIMILARITY_THRESHOLD) {
        recordSimilarity(i, j, score);
      }
    }
  }

  const groups = new Map();
  items.forEach((item, idx) => {
    const root = find(idx);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(idx);
  });

  const batches = [];
  groups.forEach(indices => {
    if (indices.length <= 1) return;
    const candidates = indices.map((originalIdx, position) => {
      const item = items[originalIdx];
      return {
        ...item,
        originalIndex: originalIdx,
        decision: position === 0 ? STATUS.BEST : STATUS.MERGE,
        diagnostics: [],
        closestMatch: null
      };
    });

    const reasonSet = new Set();
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const meta = pairMeta.get(pairKey(indices[a], indices[b]));
        meta?.reasons?.forEach(reason => reasonSet.add(reason));
      }
    }

    candidates.forEach(candidate => {
      let best = null;
      indices.forEach(otherIdx => {
        if (otherIdx === candidate.originalIndex) return;
        const meta = pairMeta.get(pairKey(candidate.originalIndex, otherIdx));
        if (!meta?.similarity) return;
        if (!best || meta.similarity > best.score) {
          best = { name: items[otherIdx].name, score: meta.similarity };
        }
      });
      candidate.closestMatch = best;
    });

    attachDiagnostics(candidates);

    batches.push({
      id: `batch-${++batchCounter}`,
      candidates,
      reasons: Array.from(reasonSet).sort()
    });
  });

  batches.sort((a, b) => b.candidates.length - a.candidates.length);
  return batches;
}

function attachDiagnostics(candidates) {
  const unitSet = new Set(candidates.map(c => (c.home_unit || '').toLowerCase()));
  const fdcValues = candidates.map(c => (c.ingredient?.fdc_id ? String(c.ingredient.fdc_id) : ''));
  const uniqueFdc = new Set(fdcValues.filter(Boolean));
  const unitVaries = unitSet.size > 1;
  const fdcConflicts = uniqueFdc.size > 1;
  const someFdc = uniqueFdc.size > 0;

  candidates.forEach(candidate => {
    const diag = [];
    if (unitVaries) {
      diag.push(candidate.home_unit ? `Unit: ${candidate.home_unit}` : 'Unit missing');
    }
    if (fdcConflicts) {
      diag.push(candidate.ingredient?.fdc_id ? `FDC ${candidate.ingredient.fdc_id}` : 'No FDC ID');
    } else if (someFdc && !candidate.ingredient?.fdc_id) {
      diag.push('Missing FDC ID');
    }
    candidate.diagnostics = diag;
  });
}

function ensureSingleBest(batch) {
  if (!batch?.candidates?.length) return;
  let bestFound = false;
  batch.candidates.forEach(candidate => {
    if (candidate.decision === STATUS.BEST) {
      if (bestFound) {
        candidate.decision = STATUS.MERGE;
      } else {
        bestFound = true;
      }
    }
  });
  if (!bestFound) {
    batch.candidates[0].decision = STATUS.BEST;
  }
}

function cleanupEmptyBatches() {
  const before = state.batches.length;
  state.batches = state.batches.filter(batch => Array.isArray(batch?.candidates) && batch.candidates.length);
  if (before !== state.batches.length) {
    refreshFilteredOrder();
  }
}

function removeCandidateFromOtherBatches(itemIndex, targetBatchId) {
  state.batches.forEach(batch => {
    if (batch.id === targetBatchId) return;
    const before = batch.candidates.length;
    batch.candidates = batch.candidates.filter(c => c.originalIndex !== itemIndex);
    if (before !== batch.candidates.length) {
      ensureSingleBest(batch);
      attachDiagnostics(batch.candidates);
    }
  });
  cleanupEmptyBatches();
}

function createCandidateFromItem(item, batch) {
  if (!item) return null;
  return {
    ...item,
    originalIndex: item.index ?? item.originalIndex ?? state.items.indexOf(item),
    decision: batch?.candidates?.length ? STATUS.MERGE : STATUS.BEST,
    diagnostics: [],
    closestMatch: null
  };
}

function refreshFilteredOrder() {
  state.filteredOrder = state.batches.map((_, idx) => idx);
  if (!state.filteredOrder.length) {
    state.currentIndex = -1;
    return;
  }
  state.currentIndex = Math.max(0, Math.min(state.currentIndex, state.filteredOrder.length - 1));
}

function searchInventory(term) {
  const tokens = term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return [];
  return state.items.filter(item =>
    tokens.every(token =>
      [item.name, item.category, item.home_unit]
        .map(value => (value || '').toLowerCase())
        .some(field => field.includes(token))
    )
  );
}

function renderSearchResults() {
  if (!searchResultsContainer || !searchResultsList) return;
  searchResultsList.innerHTML = '';
  if (!state.searchTerm) {
    searchResultsContainer.classList.add('hidden');
    return;
  }

  searchResultsContainer.classList.remove('hidden');
  if (!state.searchResults.length) {
    const empty = document.createElement('p');
    empty.className = 'placeholder';
    empty.textContent = 'No inventory items match your search.';
    searchResultsList.appendChild(empty);
    return;
  }

  state.searchResults.forEach(item => {
    const card = document.createElement('div');
    card.className = 'search-card';

    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = item.name;
    card.appendChild(nameEl);

    if (item.category) {
      const catEl = document.createElement('div');
      catEl.className = 'item-category';
      catEl.textContent = item.category;
      card.appendChild(catEl);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = 'Add to current merge';
    addBtn.addEventListener('click', () => addItemToCurrentMerge(item.index));
    card.appendChild(addBtn);

    searchResultsList.appendChild(card);
  });
}

function updateSearchResults(options = {}) {
  const { silent = false } = options;
  if (!state.searchTerm) {
    state.searchResults = [];
    renderSearchResults();
    return;
  }
  state.searchResults = searchInventory(state.searchTerm);
  renderSearchResults();
  if (!silent) {
    setStatus(
      `Found ${state.searchResults.length} item${state.searchResults.length === 1 ? '' : 's'} matching “${state.searchTerm}”.`
    );
  }
}

function announceBatchSummary() {
  if (!state.batches.length) return;
  const totalItems = state.batches.reduce((sum, batch) => sum + batch.candidates.length, 0);
  setStatus(
    `Found ${state.batches.length} batch${state.batches.length === 1 ? '' : 'es'} covering ${totalItems} item${totalItems === 1 ? '' : 's'}.`
  );
}

function getCurrentBatch() {
  if (state.currentIndex < 0) return null;
  const batchIdx = state.filteredOrder[state.currentIndex];
  return state.batches[batchIdx] || null;
}

function updateNavigationControls() {
  const total = state.filteredOrder.length;
  if (total <= 0 || state.currentIndex < 0) {
    batchPosition.textContent = '0 / 0';
    prevBatchBtn.disabled = true;
    nextBatchBtn.disabled = true;
    return;
  }
  batchPosition.textContent = `${state.currentIndex + 1} / ${total}`;
  prevBatchBtn.disabled = state.currentIndex <= 0;
  nextBatchBtn.disabled = state.currentIndex >= total - 1;
}

function summarizeProduct(product) {
  if (!product || typeof product !== 'object') return '';
  const store = product.store || product.storeName || product.store_label || '';
  const brand = product.brand || product.brandName || '';
  const size = product.size || product.sizeText || product.displaySize || '';
  const parts = [store, brand, size].map(part => (typeof part === 'string' ? part.trim() : '')).filter(Boolean);
  return parts.join(' • ');
}

function renderFdcCell(candidate) {
  const wrapper = document.createElement('div');
  wrapper.className = 'fdc-cell';

  const fdcId = candidate.ingredient?.fdc_id;
  const desc = candidate.ingredient?.fdc_description;
  const confidence = candidate.ingredient?.confidence;

  const idEl = document.createElement('div');
  idEl.className = 'fdc-id';
  idEl.textContent = fdcId ? `FDC ${fdcId}` : 'No linked FDC record';
  wrapper.appendChild(idEl);

  if (desc) {
    const descEl = document.createElement('div');
    descEl.className = 'fdc-desc';
    descEl.textContent = desc;
    wrapper.appendChild(descEl);
  }

  if (confidence != null) {
    const badge = document.createElement('span');
    badge.className = 'confidence-badge';
    badge.textContent = `Confidence: ${confidence}`;
    wrapper.appendChild(badge);
  }

  const diag = renderDiagnostics(candidate);
  if (diag) {
    wrapper.appendChild(diag);
  }

  return wrapper;
}

function renderDiagnostics(candidate) {
  if (!candidate.diagnostics?.length) return null;
  const diag = document.createElement('div');
  diag.className = 'diagnostics';
  candidate.diagnostics.forEach(text => {
    const badge = document.createElement('span');
    badge.className = 'diag-badge';
    badge.textContent = text;
    diag.appendChild(badge);
  });
  return diag;
}

function renderDecisionControls(batch, candidate) {
  const container = document.createElement('div');
  container.className = 'decision-group';
  const options = [
    { value: STATUS.LEAVE, label: 'Leave it' },
    { value: STATUS.MERGE, label: 'Merge it' },
    { value: STATUS.BEST, label: 'Best item' }
  ];

  options.forEach(option => {
    const label = document.createElement('label');
    label.className = 'decision-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `${batch.id}-${candidate.id}`;
    input.value = option.value;
    input.checked = candidate.decision === option.value;
    input.addEventListener('change', () => updateDecision(batch.id, candidate.originalIndex, option.value));
    label.appendChild(input);
    const span = document.createElement('span');
    span.textContent = option.label;
    label.appendChild(span);
    container.appendChild(label);
  });

  return container;
}

function renderBatch(batch) {
  if (!batchContainer) return;
  batchContainer.innerHTML = '';

  if (!batch) {
    renderEmptyState(state.searchTerm ? 'No batches match your search.' : 'No potential duplicates were found.');
    return;
  }

  if (batch.reasons.length) {
    const reasonBox = document.createElement('div');
    reasonBox.className = 'reason-box';
    const reasonTitle = document.createElement('h3');
    reasonTitle.textContent = 'Why this batch?';
    reasonBox.appendChild(reasonTitle);
    const list = document.createElement('ul');
    batch.reasons.forEach(reason => {
      const li = document.createElement('li');
      li.textContent = reason;
      list.appendChild(li);
    });
    reasonBox.appendChild(list);
    batchContainer.appendChild(reasonBox);
  }

  const table = document.createElement('table');
  table.className = 'batch-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Inventory item</th><th>FDC & diagnostics</th><th>Decision</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  batch.candidates.forEach(candidate => {
    const row = document.createElement('tr');

    const itemCell = document.createElement('td');
    const nameEl = document.createElement('div');
    nameEl.className = 'item-name';
    nameEl.textContent = candidate.name;
    itemCell.appendChild(nameEl);

    if (candidate.category) {
      const catEl = document.createElement('div');
      catEl.className = 'item-category';
      catEl.textContent = candidate.category;
      itemCell.appendChild(catEl);
    }

    const unitEl = document.createElement('div');
    unitEl.className = 'item-unit';
    unitEl.textContent = candidate.home_unit ? `Home unit: ${candidate.home_unit}` : 'No home unit recorded';
    itemCell.appendChild(unitEl);

    const productSummary = summarizeProduct(candidate.product);
    if (productSummary) {
      const storeEl = document.createElement('div');
      storeEl.className = 'item-store';
      storeEl.textContent = productSummary;
      itemCell.appendChild(storeEl);
    }

    if (candidate.closestMatch) {
      const similarityEl = document.createElement('div');
      similarityEl.className = 'item-similarity';
      similarityEl.textContent = `Closest match: ${candidate.closestMatch.name} (${(candidate.closestMatch.score * 100).toFixed(0)}%)`;
      itemCell.appendChild(similarityEl);
    }

    tbody.appendChild(row);
    row.appendChild(itemCell);

    const fdcCell = document.createElement('td');
    fdcCell.appendChild(renderFdcCell(candidate));
    row.appendChild(fdcCell);

    const decisionCell = document.createElement('td');
    decisionCell.appendChild(renderDecisionControls(batch, candidate));
    row.appendChild(decisionCell);
  });

  table.appendChild(tbody);
  batchContainer.appendChild(table);

  const dismissWrapper = document.createElement('div');
  dismissWrapper.className = 'batch-actions';
  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.textContent = 'Don’t flag these again';
  dismissBtn.addEventListener('click', () => handleDismissBatch(batch));
  dismissWrapper.appendChild(dismissBtn);
  batchContainer.appendChild(dismissWrapper);
}

function addItemToCurrentMerge(itemIndex) {
  const item = state.items[itemIndex];
  if (!item) {
    setStatus('Unable to add item from search; it was not found in the inventory list.');
    return;
  }

  let batch = getCurrentBatch();
  if (!batch) {
    batch = {
      id: `manual-batch-${Date.now()}`,
      candidates: [],
      reasons: ['Manually added from search']
    };
    state.batches.push(batch);
    state.currentIndex = state.batches.length - 1;
  }

  removeCandidateFromOtherBatches(itemIndex, batch.id);

  if (batch.candidates.some(c => c.originalIndex === itemIndex)) {
    setStatus(`“${item.name}” is already in the current batch.`);
  } else {
    const candidate = createCandidateFromItem(item, batch);
    if (!candidate) return;
    batch.candidates.push(candidate);
    attachDiagnostics(batch.candidates);
    ensureSingleBest(batch);
    if (!Array.isArray(batch.reasons)) batch.reasons = [];
    if (!batch.reasons.includes('Manually added from search')) {
      batch.reasons.unshift('Manually added from search');
    }
    setStatus(`Added “${item.name}” to the current batch. Add more items to decide on this merge.`);
  }

  refreshFilteredOrder();
  const batchIdx = state.batches.indexOf(batch);
  const filteredIdx = state.filteredOrder.indexOf(batchIdx);
  state.currentIndex = filteredIdx >= 0 ? filteredIdx : state.filteredOrder.length ? 0 : -1;
  updateApplyButtonState();
  updateNavigationControls();
  renderBatch(batch);
}

async function handleDismissBatch(batch) {
  if (!batch?.candidates?.length) return;
  const canonicals = Array.from(
    new Set(batch.candidates.map(candidate => candidate.canonical).filter(Boolean))
  );
  if (canonicals.length < 2) {
    setStatus('Not enough unique items to dismiss this batch.');
    return;
  }
  const confirmMessage =
    canonicals.length === 2
      ? `Stop flagging “${batch.candidates[0].name}” with “${batch.candidates[1].name}”?`
      : 'Stop flagging all combinations in this batch as potential duplicates?';
  const proceed = window.confirm(confirmMessage);
  if (!proceed) return;
  let added = 0;
  for (let i = 0; i < canonicals.length; i++) {
    for (let j = i + 1; j < canonicals.length; j++) {
      const key = pairKeyFromCanonicals(canonicals[i], canonicals[j]);
      if (!key) continue;
      if (!state.dismissedPairs.has(key)) {
        state.dismissedPairs.add(key);
        added += 1;
      }
    }
  }
  if (!added) {
    setStatus('These items were already dismissed.');
    return;
  }
  await persistDismissedPairs();
  setStatus('This batch will no longer be flagged as similar.');
  await rescanInventory();
}

function updateDecision(batchId, originalIndex, value) {
  const batch = state.batches.find(b => b.id === batchId);
  if (!batch) return;
  const candidate = batch.candidates.find(c => c.originalIndex === originalIndex);
  if (!candidate) return;
  candidate.decision = value;
  if (value === STATUS.BEST) {
    batch.candidates.forEach(other => {
      if (other === candidate) return;
      if (other.decision === STATUS.BEST) {
        other.decision = STATUS.LEAVE;
      }
    });
  }
  enforceBestSelection(batch);
  updateApplyButtonState();
  renderBatch(getCurrentBatch());
}

function enforceBestSelection(batch) {
  const bestCount = batch.candidates.filter(c => c.decision === STATUS.BEST).length;
  if (bestCount === 0) {
    const fallback = batch.candidates[0];
    if (fallback) fallback.decision = STATUS.BEST;
  } else if (bestCount > 1) {
    let keep = true;
    batch.candidates.forEach(candidate => {
      if (candidate.decision !== STATUS.BEST) return;
      if (keep) {
        keep = false;
      } else {
        candidate.decision = STATUS.MERGE;
      }
    });
  }
}

function updateApplyButtonState() {
  if (state.isScanning || state.isApplying || !state.batches.length) {
    applyBtn.disabled = true;
    return;
  }
  const allValid = state.batches.every(batch => batch.candidates.filter(c => c.decision === STATUS.BEST).length === 1);
  applyBtn.disabled = !allValid;
}

async function rescanInventory() {
  if (state.isScanning) return;
  state.isScanning = true;
  updateApplyButtonState();
  rescanBtn.disabled = true;
  setStatus('Scanning inventory for similar items…');
  renderEmptyState('Scanning…');
  batchPosition.textContent = '0 / 0';
  prevBatchBtn.disabled = true;
  nextBatchBtn.disabled = true;

  try {
    const [needs, ingredientMap, dismissedStore] = await Promise.all([
      loadNeeds(),
      getIngredientMap(),
      loadDismissedPairStore()
    ]);
    const itemNames = needs.map(item => item?.name).filter(Boolean);
    const finalProducts = await loadFinalProducts(itemNames);
    state.items = enrichItems(needs, finalProducts, ingredientMap);
    const dismissedPairs = new Set(Object.keys(dismissedStore || {}));
    state.dismissedPairs = dismissedPairs;
    state.batches = buildDuplicateBatches(state.items, dismissedPairs);
    state.currentIndex = state.batches.length ? 0 : -1;
    refreshFilteredOrder();
    updateApplyButtonState();
    updateNavigationControls();
    renderBatch(getCurrentBatch());
    const totalItems = state.batches.reduce((sum, batch) => sum + batch.candidates.length, 0);
    if (state.batches.length) {
      setStatus(`Found ${state.batches.length} batch${state.batches.length === 1 ? '' : 'es'} covering ${totalItems} item${totalItems === 1 ? '' : 's'}.`);
    } else {
      setStatus('No potential duplicates were detected.');
      renderEmptyState('No potential duplicates were detected.');
    }
    if (state.searchTerm) {
      updateSearchResults({ silent: true });
    } else {
      renderSearchResults();
    }
  } catch (error) {
    console.error('Failed to scan inventory', error);
    setStatus('Unable to scan inventory. Please try again.');
    renderEmptyState('Unable to scan inventory.');
  } finally {
    state.isScanning = false;
    rescanBtn.disabled = false;
    updateApplyButtonState();
  }
}

function handleSearchInput(event) {
  state.searchTerm = (event?.target?.value || '').trim();
  if (state.searchTerm) {
    updateSearchResults();
  } else {
    state.searchResults = [];
    renderSearchResults();
    announceBatchSummary();
  }
}

function collectMergeOperations() {
  const operations = [];
  state.batches.forEach(batch => {
    const best = batch.candidates.find(c => c.decision === STATUS.BEST);
    if (!best) return;
    const merges = batch.candidates.filter(c => c.decision === STATUS.MERGE);
    if (!merges.length) return;
    operations.push({
      batchId: batch.id,
      bestName: best.name,
      bestCanonical: canonicalName(best.name),
      bestCandidate: best,
      mergeNames: merges.map(c => c.name),
      mergeCanonicals: merges.map(c => canonicalName(c.name))
    });
  });
  return operations;
}

function mergeArrayRecords(arr, operation, options = {}) {
  if (!Array.isArray(arr) || !arr.length) return;
  const { bestName, bestCanonical, mergeCanonicals, bestCandidate } = operation;
  const canonicals = new Set([bestCanonical, ...(mergeCanonicals || [])]);
  const matches = arr.filter(entry => canonicals.has(canonicalName(entry?.name || '')));
  if (!matches.length) return;
  let base = matches.find(entry => canonicalName(entry.name) === bestCanonical) || matches[0];
  base.name = bestName;
  const sumFields = options.sumFields || [];
  sumFields.forEach(field => {
    let total = 0;
    let hasValue = false;
    matches.forEach(entry => {
      const value = Number(entry?.[field]);
      if (!Number.isNaN(value)) {
        total += value;
        hasValue = true;
      }
    });
    if (hasValue) {
      base[field] = total;
    }
  });
  const preferRawFields = options.preferRawFields || [];
  if (preferRawFields.length && bestCandidate?.raw) {
    preferRawFields.forEach(field => {
      if (bestCandidate.raw[field] !== undefined) {
        base[field] = bestCandidate.raw[field];
      }
    });
  }
  matches.forEach(entry => {
    if (entry === base) return;
    const idx = arr.indexOf(entry);
    if (idx >= 0) arr.splice(idx, 1);
  });
}

function mergeArrayValues(target, source) {
  const base = Array.isArray(target) ? [...target] : [];
  if (Array.isArray(source)) {
    base.push(...source);
  }
  return base;
}

function mergeObjectValues(target, source) {
  const result = { ...(target || {}) };
  Object.entries(source || {}).forEach(([key, value]) => {
    result[key] = value;
  });
  return result;
}

function mergeSeasonValues(target, source) {
  const combined = mergeArrayValues(target, source);
  const seen = new Set();
  return combined.filter(entry => {
    const signature = JSON.stringify(entry);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function mergeMapEntries(map, operation, mergeFn) {
  if (!map) return;
  const { bestName, bestCanonical, mergeCanonicals } = operation;
  const canonicals = new Set([bestCanonical, ...(mergeCanonicals || [])]);
  const keys = Object.keys(map);
  let targetKey = keys.find(key => canonicalName(key) === bestCanonical) || bestName;
  let value = map[targetKey];
  keys.forEach(key => {
    if (key === targetKey) return;
    if (!canonicals.has(canonicalName(key))) return;
    value = mergeFn(value, map[key]);
    delete map[key];
  });
  if (targetKey !== bestName) {
    delete map[targetKey];
  }
  const existingBest = map[bestName];
  if (existingBest !== undefined && existingBest !== value) {
    value = mergeFn(value, existingBest);
  } else if (value === undefined) {
    value = existingBest;
  }
  if (value === undefined) {
    delete map[bestName];
  } else {
    map[bestName] = value;
  }
}

function renameMeals(mealsByType, operation) {
  const { bestName, bestCanonical, mergeCanonicals } = operation;
  const canonicals = new Set([bestCanonical, ...(mergeCanonicals || [])]);
  Object.values(mealsByType || {}).forEach(meals => {
    (meals || []).forEach(meal => {
      (meal.ingredients || []).forEach(ing => {
        if (canonicals.has(canonicalName(ing?.name || ''))) {
          ing.name = bestName;
        }
      });
    });
  });
}

async function loadMergeContext() {
  await initializeMealCategories();
  const mealEntries = Object.entries(MEAL_TYPES);
  const mealLists = await Promise.all(mealEntries.map(([, info]) => loadMealsForType(info)));
  const [needs, consumption, stock, expiration, consumed, purchases, overrides, history, itemSeasons] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadPurchases(),
    loadOverrides(),
    loadHistory(),
    loadItemSeasons()
  ]);
  const mealsByType = {};
  mealEntries.forEach(([type], idx) => {
    mealsByType[type] = mealLists[idx];
  });
  return {
    needs,
    consumption,
    stock,
    expiration,
    consumed,
    purchases,
    overrides,
    history,
    itemSeasons,
    mealsByType,
    mealEntries
  };
}

function cloneData(data) {
  return data == null ? data : JSON.parse(JSON.stringify(data));
}

function cloneContext(context) {
  return {
    needs: cloneData(context.needs),
    consumption: cloneData(context.consumption),
    stock: cloneData(context.stock),
    expiration: cloneData(context.expiration),
    consumed: cloneData(context.consumed),
    purchases: cloneData(context.purchases),
    overrides: cloneData(context.overrides),
    history: cloneData(context.history),
    itemSeasons: cloneData(context.itemSeasons),
    mealsByType: Object.fromEntries(Object.entries(context.mealsByType || {}).map(([type, meals]) => [type, cloneData(meals)])),
    mealEntries: context.mealEntries?.map(([type, info]) => [type, { ...info }]) || []
  };
}

function applyOperationToContext(context, operation) {
  mergeArrayRecords(context.needs, operation, {
    sumFields: ['total_needed_year'],
    preferRawFields: ['category', 'home_unit', 'unit', 'treat_as_whole_unit', 'notes']
  });
  mergeArrayRecords(context.consumption, operation, { sumFields: ['monthly_consumption'] });
  mergeArrayRecords(context.stock, operation, { sumFields: ['amount'] });
  mergeArrayRecords(context.expiration, operation);
  mergeArrayRecords(context.consumed, operation, { sumFields: ['amount'] });
  mergeMapEntries(context.purchases, operation, mergeArrayValues);
  mergeMapEntries(context.overrides, operation, mergeObjectValues);
  mergeMapEntries(context.history, operation, mergeArrayValues);
  mergeMapEntries(context.itemSeasons, operation, mergeSeasonValues);
  renameMeals(context.mealsByType, operation);
}

async function saveContext(context) {
  await Promise.all([
    saveValue('yearlyNeeds', context.needs),
    saveValue('monthlyConsumption', context.consumption),
    saveValue('currentStock', context.stock),
    saveValue('expirationData', context.expiration),
    saveValue('consumedThisYear', context.consumed),
    savePurchases(context.purchases),
    saveOverrides(context.overrides),
    saveHistory(context.history),
    saveItemSeasons(context.itemSeasons),
    ...context.mealEntries.map(([type, info]) => saveValue(info.key, context.mealsByType[type] || []))
  ]);
}

function finalKey(name) {
  return `final_${encodeURIComponent(name)}`;
}

function finalProductKey(name) {
  return `final_product_${encodeURIComponent(name)}`;
}

function collectFinalKeys(operations) {
  const names = new Set();
  operations.forEach(op => {
    names.add(op.bestName);
    op.mergeNames.forEach(name => names.add(name));
  });
  const keys = [];
  names.forEach(name => {
    keys.push(finalKey(name), finalProductKey(name));
  });
  return keys;
}

function getStorageEntries(keys) {
  return new Promise(resolve => {
    if (!keys.length) {
      resolve({});
      return;
    }
    chrome.storage.local.get(keys, data => resolve(data || {}));
  });
}

async function migrateFinalEntries(bestName, mergeNames = []) {
  const names = [bestName, ...mergeNames];
  const keys = names.flatMap(name => [finalKey(name), finalProductKey(name)]);
  const data = await getStorageEntries(keys);
  const sets = {};
  let bestFinal = data[finalKey(bestName)];
  let bestProduct = data[finalProductKey(bestName)];
  mergeNames.forEach(name => {
    const fKey = finalKey(name);
    const pKey = finalProductKey(name);
    const finalVal = data[fKey];
    const prodVal = data[pKey];
    if (finalVal !== undefined && (bestFinal === undefined || bestFinal === null)) {
      bestFinal = finalVal;
      sets[finalKey(bestName)] = finalVal;
    }
    if (prodVal !== undefined && (bestProduct === undefined || bestProduct === null)) {
      bestProduct = prodVal;
      sets[finalProductKey(bestName)] = prodVal;
    }
  });
  const removeKeys = mergeNames.flatMap(name => [finalKey(name), finalProductKey(name)]);
  await new Promise(resolve => chrome.storage.local.set(sets, () => resolve()));
  if (removeKeys.length) {
    await new Promise(resolve => chrome.storage.local.remove(removeKeys, resolve));
  }
}

async function migrateFinalDataForOperations(operations) {
  for (const op of operations) {
    await migrateFinalEntries(op.bestName, op.mergeNames);
  }
}

async function restoreFinalState(snapshot) {
  if (!snapshot?.finalKeys) return;
  const setPayload = {};
  const removeKeys = [];
  snapshot.finalKeys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(snapshot.finalEntries, key)) {
      setPayload[key] = snapshot.finalEntries[key];
    } else {
      removeKeys.push(key);
    }
  });
  await new Promise(resolve => chrome.storage.local.set(setPayload, () => resolve()));
  if (removeKeys.length) {
    await new Promise(resolve => chrome.storage.local.remove(removeKeys, resolve));
  }
}

function summarizeContextApplication(context, operations) {
  operations.forEach(op => applyOperationToContext(context, op));
  const mergedCount = operations.reduce((total, op) => total + op.mergeNames.length, 0);
  const targets = new Set(operations.map(op => op.bestName));
  return { mergedCount, targetCount: targets.size };
}

function collectDeletionCandidates(operations) {
  const set = new Set();
  operations.forEach(op => {
    op.mergeNames.forEach(name => set.add(name));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function notifyInventoryUpdate() {
  try {
    chrome.runtime.sendMessage({ type: 'inventory-updated' });
  } catch (_) {}
}

function renderDeletionRows(names) {
  if (!deletionList) return;
  deletionList.innerHTML = '';
  if (!names.length) {
    const empty = document.createElement('p');
    empty.className = 'placeholder';
    empty.textContent = 'No merged items need to be removed.';
    deletionList.appendChild(empty);
    return;
  }
  names.forEach((name, index) => {
    const row = document.createElement('div');
    row.className = 'deletion-row';
    const label = document.createElement('span');
    label.textContent = name;
    row.appendChild(label);
    const group = document.createElement('div');
    group.className = 'option-group';

    const yesLabel = document.createElement('label');
    const yesInput = document.createElement('input');
    yesInput.type = 'radio';
    yesInput.name = `delete-${index}`;
    yesInput.value = 'yes';
    yesInput.checked = state.deletionChoices.get(name) !== false;
    yesInput.addEventListener('change', () => state.deletionChoices.set(name, true));
    yesLabel.appendChild(yesInput);
    yesLabel.appendChild(document.createTextNode('Yes'));

    const noLabel = document.createElement('label');
    const noInput = document.createElement('input');
    noInput.type = 'radio';
    noInput.name = `delete-${index}`;
    noInput.value = 'no';
    noInput.checked = state.deletionChoices.get(name) === false;
    noInput.addEventListener('change', () => state.deletionChoices.set(name, false));
    noLabel.appendChild(noInput);
    noLabel.appendChild(document.createTextNode('No'));

    group.appendChild(yesLabel);
    group.appendChild(noLabel);
    row.appendChild(group);
    deletionList.appendChild(row);
  });
}

function closeDeletionModal() {
  if (!deletionModal) return;
  deletionModal.classList.add('hidden');
  state.pendingDeletionCandidates = [];
  state.deletionChoices.clear();
  state.isDeletionConfirming = false;
  if (confirmDeletionBtn) confirmDeletionBtn.disabled = false;
  if (cancelDeletionBtn) cancelDeletionBtn.disabled = false;
}

function openDeletionModal(names) {
  if (!deletionModal || !deletionList || !confirmDeletionBtn || !cancelDeletionBtn) {
    console.warn('Deletion modal elements missing; skipping prompt.');
    rescanInventory();
    return;
  }
  state.pendingDeletionCandidates = names.slice();
  state.deletionChoices = new Map(names.map(name => [name, true]));
  renderDeletionRows(names);
  deletionModal.classList.remove('hidden');
  setStatus('Merged items applied. Confirm which ones should be removed.');
}

async function handleDeletionConfirm() {
  if (state.isDeletionConfirming) return;
  const candidates = state.pendingDeletionCandidates.slice();
  if (!candidates.length) {
    closeDeletionModal();
    await rescanInventory();
    return;
  }
  state.isDeletionConfirming = true;
  if (confirmDeletionBtn) confirmDeletionBtn.disabled = true;
  if (cancelDeletionBtn) cancelDeletionBtn.disabled = true;
  const selections = candidates.filter(name => state.deletionChoices.get(name) !== false);
  try {
    if (selections.length) {
      await queueItemDeletions(selections);
      setStatus(`Queued ${selections.length} merged item${selections.length === 1 ? '' : 's'} for deletion.`);
    } else {
      setStatus('No merged items were selected for deletion.');
    }
    closeDeletionModal();
    await rescanInventory();
  } catch (error) {
    console.error('Unable to queue merged item deletions', error);
    setStatus('Unable to queue deletions. Please review the console for details.');
    state.isDeletionConfirming = false;
    if (confirmDeletionBtn) confirmDeletionBtn.disabled = false;
    if (cancelDeletionBtn) cancelDeletionBtn.disabled = false;
  }
}

async function handleDeletionCancel() {
  if (state.isDeletionConfirming) return;
  setStatus('Merged items were kept in the inventory.');
  closeDeletionModal();
  await rescanInventory();
}

async function handleApplyClick() {
  if (state.isApplying) return;
  const operations = collectMergeOperations();
  if (!operations.length) {
    setStatus('No items were marked for merging. Choose “Merge it” before applying.');
    return;
  }
  const previousSnapshot = state.lastSnapshot;
  const hadUndo = !!previousSnapshot;
  let snapshot = null;
  state.isApplying = true;
  rescanBtn.disabled = true;
  undoBtn.disabled = true;
  updateApplyButtonState();
  setStatus('Applying merge decisions…');
  try {
    const context = await loadMergeContext();
    const finalKeys = collectFinalKeys(operations);
    const finalEntries = await getStorageEntries(finalKeys);
    snapshot = {
      context: cloneContext(context),
      finalKeys,
      finalEntries
    };
    const summary = summarizeContextApplication(context, operations);
    await saveContext(context);
    await migrateFinalDataForOperations(operations);
    await calculateAndSaveMealNeeds();
    notifyInventoryUpdate();
    state.lastSnapshot = snapshot;
    undoBtn.disabled = false;
    const deletionCandidates = collectDeletionCandidates(operations);
    setStatus(
      `Merged ${summary.mergedCount} item${summary.mergedCount === 1 ? '' : 's'} into ${summary.targetCount} target${summary.targetCount === 1 ? '' : 's'}.`
    );
    if (deletionCandidates.length) {
      openDeletionModal(deletionCandidates);
    } else {
      await rescanInventory();
    }
  } catch (error) {
    console.error('Failed to apply merge decisions', error);
    if (snapshot) {
      await saveContext(cloneContext(snapshot.context));
      await restoreFinalState(snapshot);
    }
    state.lastSnapshot = previousSnapshot;
    undoBtn.disabled = !state.lastSnapshot;
    setStatus('Unable to apply merge decisions. Please review the console for details.');
    await rescanInventory();
  } finally {
    state.isApplying = false;
    rescanBtn.disabled = false;
    updateApplyButtonState();
    if (!state.lastSnapshot && hadUndo) {
      undoBtn.disabled = true;
    }
  }
}

async function undoLastMerge() {
  if (state.isApplying || !state.lastSnapshot) return;
  state.isApplying = true;
  rescanBtn.disabled = true;
  undoBtn.disabled = true;
  updateApplyButtonState();
  setStatus('Restoring inventory snapshot…');
  try {
    await saveContext(cloneContext(state.lastSnapshot.context));
    await restoreFinalState(state.lastSnapshot);
    await calculateAndSaveMealNeeds();
    notifyInventoryUpdate();
    state.lastSnapshot = null;
    setStatus('Previous merge changes were undone.');
    await rescanInventory();
  } catch (error) {
    console.error('Failed to undo merge decisions', error);
    setStatus('Unable to undo merge decisions. See console for details.');
    undoBtn.disabled = false;
  } finally {
    state.isApplying = false;
    rescanBtn.disabled = false;
    updateApplyButtonState();
    if (!state.lastSnapshot) {
      undoBtn.disabled = true;
    }
  }
}

prevBatchBtn?.addEventListener('click', () => {
  if (state.currentIndex <= 0) return;
  state.currentIndex -= 1;
  updateNavigationControls();
  renderBatch(getCurrentBatch());
});

nextBatchBtn?.addEventListener('click', () => {
  if (state.currentIndex >= state.filteredOrder.length - 1) return;
  state.currentIndex += 1;
  updateNavigationControls();
  renderBatch(getCurrentBatch());
});

rescanBtn?.addEventListener('click', rescanInventory);
searchBox?.addEventListener('input', handleSearchInput);
applyBtn?.addEventListener('click', handleApplyClick);
undoBtn?.addEventListener('click', undoLastMerge);
confirmDeletionBtn?.addEventListener('click', handleDeletionConfirm);
cancelDeletionBtn?.addEventListener('click', handleDeletionCancel);

// Kick off the initial scan once the popup is ready.
rescanInventory();

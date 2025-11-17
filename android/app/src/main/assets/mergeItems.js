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
const STORE_SELECTION_PATH = 'Required for grocery app/store_selection_stopandshop.json';
const STORE_SELECTION_KEY = 'storeSelections';
const SIMILARITY_THRESHOLD = 0.82;
const STATUS = {
  LEAVE: 'leave',
  MERGE: 'merge',
  BEST: 'best'
};

const STORE_LINKS = {
  'Stop & Shop': name =>
    `https://stopandshop.com/product-search/${name.replace(/ /g, '%20')}?searchRef=&semanticSearch=false`,
  Walmart: name =>
    `https://www.walmart.com/search?q=${encodeURIComponent(
      name.replace(/ /g, '+')
    )}&facet=fulfillment_method_in_store%3AIn-store%7C%7Cexclude_oos%3AShow+available+items+only`,
  Amazon: name =>
    `https://www.amazon.com/s?k=${name
      .split(/\s+/)
      .map(encodeURIComponent)
      .join('+')}`,
  Shaws: name =>
    `https://www.shaws.com/shop/search-results.html?q=${name.replace(/ /g, '%20')}`,
  'Roche Bros': name =>
    `https://onlineshopping.rochebros.com/search?searchTerms=${name.replace(/ /g, '%20')}`,
  Hannaford: name =>
    `https://www.hannaford.com/search/product?form_state=searchForm&keyword=${name.replace(/ /g, '+')}&ieDummyTextField=&productTypeId=P`
};

const state = {
  items: [],
  batches: [],
  filteredOrder: [],
  currentIndex: -1,
  searchTerm: '',
  isScanning: false,
  isApplying: false,
  lastSnapshot: null
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
const loadStoreSelections = () => loadArrayWithFallback(STORE_SELECTION_KEY, STORE_SELECTION_PATH);

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

function buildDuplicateBatches(items) {
  if (!items.length) return [];
  const parent = items.map((_, idx) => idx);
  const pairMeta = new Map();
  let batchCounter = 0;

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
    if (a === b) return;
    const meta = ensurePairMeta(a, b);
    if (reason) meta.reasons.add(reason);
    union(a, b);
  };

  const recordSimilarity = (a, b, score) => {
    if (a === b) return;
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
        noteReason(a, list[j], `Share FDC ID ${fdcId}`);
      }
    });
  });

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
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

function refreshFilteredOrder() {
  const tokens = state.searchTerm
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  state.filteredOrder = state.batches
    .map((batch, idx) => ({ batch, idx }))
    .filter(({ batch }) => {
      if (!tokens.length) return true;
      const haystack = batch.candidates.map(c => c.name.toLowerCase()).join(' ');
      return tokens.every(token => haystack.includes(token));
    })
    .map(entry => entry.idx);
  state.currentIndex = state.filteredOrder.length ? Math.max(0, Math.min(state.currentIndex, state.filteredOrder.length - 1)) : -1;
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
    const needs = await loadNeeds();
    const ingredientMap = await getIngredientMap();
    const itemNames = needs.map(item => item?.name).filter(Boolean);
    const finalProducts = await loadFinalProducts(itemNames);
    state.items = enrichItems(needs, finalProducts, ingredientMap);
    state.batches = buildDuplicateBatches(state.items);
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
  refreshFilteredOrder();
  updateNavigationControls();
  renderBatch(getCurrentBatch());
  if (state.searchTerm) {
    setStatus(`Showing ${state.filteredOrder.length} batch${state.filteredOrder.length === 1 ? '' : 'es'} that match “${state.searchTerm}”.`);
  } else if (state.batches.length) {
    const totalItems = state.batches.reduce((sum, batch) => sum + batch.candidates.length, 0);
    setStatus(`Found ${state.batches.length} batch${state.batches.length === 1 ? '' : 'es'} covering ${totalItems} item${totalItems === 1 ? '' : 's'}.`);
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

function selectionScore(entry) {
  const interestingFields = ['price', 'convertedQty', 'pricePerUnit', 'link', 'image'];
  return interestingFields.reduce((score, field) => score + (entry?.[field] ? 1 : 0), 0);
}

function mergeSelectionDetails(target, source) {
  Object.keys(source || {}).forEach(key => {
    if (key === 'name' || key === 'store') return;
    if (target[key] == null || target[key] === '') {
      target[key] = source[key];
    }
  });
}

function updateSelectionLink(selection) {
  if (selection?.store && STORE_LINKS[selection.store]) {
    selection.link = STORE_LINKS[selection.store](selection.name);
  }
}

function mergeStoreSelections(selections, operation) {
  if (!Array.isArray(selections) || !selections.length) return;
  const { bestName, bestCanonical, mergeCanonicals } = operation;
  const canonicals = new Set([bestCanonical, ...(mergeCanonicals || [])]);
  const grouped = new Map();
  selections.forEach(entry => {
    if (!entry?.name) return;
    if (!canonicals.has(canonicalName(entry.name))) return;
    entry.name = bestName;
    updateSelectionLink(entry);
    const key = entry.store || '';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(entry);
  });
  const toRemove = new Set();
  grouped.forEach(list => {
    if (list.length <= 1) return;
    list.sort((a, b) => selectionScore(b) - selectionScore(a));
    const keeper = list[0];
    for (let i = 1; i < list.length; i++) {
      mergeSelectionDetails(keeper, list[i]);
      toRemove.add(list[i]);
    }
  });
  for (let i = selections.length - 1; i >= 0; i--) {
    if (toRemove.has(selections[i])) {
      selections.splice(i, 1);
    }
  }
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
  const [needs, consumption, stock, expiration, consumed, selections, purchases, overrides, history, itemSeasons] = await Promise.all([
    loadNeeds(),
    loadConsumption(),
    loadStock(),
    loadExpiration(),
    loadConsumed(),
    loadStoreSelections(),
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
    selections,
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
    selections: cloneData(context.selections),
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
  mergeStoreSelections(context.selections, operation);
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
    saveValue(STORE_SELECTION_KEY, context.selections),
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

function notifyInventoryUpdate() {
  try {
    chrome.runtime.sendMessage({ type: 'inventory-updated' });
  } catch (_) {}
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
    setStatus(`Merged ${summary.mergedCount} item${summary.mergedCount === 1 ? '' : 's'} into ${summary.targetCount} target${summary.targetCount === 1 ? '' : 's'}.`);
    await rescanInventory();
  } catch (error) {
    console.error('Failed to apply merge decisions', error);
    if (snapshot) {
      await saveContext(cloneContext(snapshot.context));
      await restoreFinalState(snapshot);
    }
    state.lastSnapshot = previousSnapshot;
    undoBtn.disabled = !state.lastSnapshot;
    setStatus('Unable to apply merge decisions. Please review the console for details.');
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

// Kick off the initial scan once the popup is ready.
rescanInventory();

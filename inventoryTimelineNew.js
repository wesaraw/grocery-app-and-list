import { getCurrentWeek, loadTimelineItems, simulateItem } from './inventoryTimelineData.js';
import { openOrFocusWindow } from './utils/windowUtils.js';

const state = {
  items: [],
  snapshots: new Map(),
  filter: 'in-stock',
  currentWeek: Math.min(Math.max(getCurrentWeek(), 1), 52),
  expanded: new Set(),
  locationImages: new Map(),
  hasLoaded: false,
};

const categoryGrid = document.getElementById('categoryGrid');
const loadingState = document.getElementById('loadingState');
const statusWeek = document.getElementById('statusWeek');
const filterInStock = document.getElementById('filterInStock');
const filterNeedsRestock = document.getElementById('filterNeedsRestock');
const filterAll = document.getElementById('filterAll');
const settingsPanel = document.getElementById('settingsPanel');
const settingsScrim = document.getElementById('settingsScrim');
const closeSettings = document.getElementById('closeSettings');
const backendFrame = document.getElementById('legacyTimelineBackend');
const openClassicTimeline = document.getElementById('openClassicTimeline');

function normalizeCategoryKey(category) {
  return (category || '').trim().toLowerCase();
}

function snapshotFor(item) {
  if (state.snapshots.has(item.name)) return state.snapshots.get(item.name);
  const overrides = item.overrideWeeks || {};
  const weeks = simulateItem(item, overrides);
  const weekIndex = Math.min(Math.max(state.currentWeek, 1), weeks.length) - 1;
  const current = weeks[weekIndex] || {};
  const runoutIndex = weeks.findIndex((w) => w.rawQty <= 0);
  const coverageWeeks =
    runoutIndex === -1 ? null : Math.max(runoutIndex - weekIndex, 0);
  const snapshot = {
    weeks,
    status: current.cls || 'red',
    qtyLabel: current.qty || '0',
    rawQty: current.rawQty ?? 0,
    expiresInWeeks: current.weeksToExpiration ?? 0,
    coverageWeeks,
    weeklyConsumption: item.weekly_consumption || 0,
  };
  state.snapshots.set(item.name, snapshot);
  return snapshot;
}

function renderEmpty(message) {
  categoryGrid.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = message;
  categoryGrid.appendChild(empty);
}

function renderItemCard(item, locationImage) {
  const snap = snapshotFor(item);
  const card = document.createElement('article');
  const cardImage = locationImage || item.finalProduct?.image || null;
  card.className = 'item-card';

  const backdrop = document.createElement('div');
  backdrop.className = 'item-card__backdrop';
  if (cardImage) {
    card.classList.add('item-card--has-image');
    card.style.setProperty('--item-card-bg-image', `url("${cardImage}")`);
  }

  card.appendChild(backdrop);

  const header = document.createElement('div');
  header.className = 'item-card__header';

  const title = document.createElement('h4');
  title.className = 'item-title';
  title.textContent = item.name;

  const badge = document.createElement('span');
  badge.className = `badge badge--${snap.status}`;
  badge.textContent = snap.rawQty > 0 ? `${snap.qtyLabel} on hand` : 'Out of stock';

  header.append(title, badge);

  const statusRow = document.createElement('div');
  statusRow.className = 'item-card__status';

  const statusMeta = deriveStatusMeta(snap);
  const statusPill = buildStatusPill(statusMeta.label, statusMeta.tone);
  const coverageLabel = snap.coverageWeeks === null
    ? 'Coverage n/a'
    : `${snap.coverageWeeks} wk${snap.coverageWeeks === 1 ? '' : 's'} of cover`;
  const coverageTone = snap.coverageWeeks === null
    ? 'neutral'
    : snap.coverageWeeks === 0
      ? 'danger'
      : snap.coverageWeeks < 3
        ? 'warning'
        : 'success';
  const coveragePill = buildStatusPill(coverageLabel, coverageTone);

  const expirationTone = snap.expiresInWeeks <= 0
    ? 'danger'
    : snap.expiresInWeeks < 2
      ? 'warning'
      : 'neutral';
  const expirationLabel = snap.expiresInWeeks <= 0
    ? 'Expired'
    : `${snap.expiresInWeeks} wk${snap.expiresInWeeks === 1 ? '' : 's'} to expire`;
  const expirationPill = buildStatusPill(expirationLabel, expirationTone);

  statusRow.append(statusPill, coveragePill, expirationPill);

  const stats = document.createElement('div');
  stats.className = 'item-card__stats';

  const consumption = createStatRow('Weekly use', formatWeeklyConsumption(item.weekly_consumption), 'neutral');
  const coverage = createStatRow('Projected cover', coverageLabel, coverageTone);
  const expiration = createStatRow('Expiry runway', expirationLabel, expirationTone);
  stats.append(consumption, coverage, expiration);

  card.append(header, statusRow, stats);
  return card;
}

function formatWeeklyConsumption(value) {
  if (!Number.isFinite(value) || value === 0) return 'Not set';
  return `${value.toFixed(2)} / wk`;
}

function deriveStatusMeta(snap) {
  const toneMap = { green: 'success', yellow: 'warning', red: 'danger' };
  const labelMap = { green: 'Healthy stock', yellow: 'Running low', red: 'At risk' };
  return {
    tone: toneMap[snap.status] || 'danger',
    label: labelMap[snap.status] || 'At risk',
  };
}

function buildStatusPill(text, tone = 'neutral') {
  const pill = document.createElement('span');
  pill.className = `status-pill status-pill--${tone}`;
  pill.textContent = text;
  return pill;
}

function createStatRow(label, value, tone = 'neutral') {
  const row = document.createElement('div');
  row.className = `stat-row stat-row--${tone}`;
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-row__label';
  labelEl.textContent = label;
  const valueEl = document.createElement('div');
  valueEl.className = 'stat-row__value';
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}

function renderCategoryCard(category, items) {
  const card = document.createElement('section');
  card.className = 'category-card';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'category-card__header';
  header.setAttribute('aria-expanded', state.expanded.has(category) ? 'true' : 'false');

  const imageWrapper = document.createElement('div');
  imageWrapper.className = 'category-card__image';
  const normalizedCategory = normalizeCategoryKey(category);
  const storedImage = state.locationImages.get(normalizedCategory);
  const sample = items.find(i => i.finalProduct && i.finalProduct.image);
  const chosenImage = storedImage || sample?.finalProduct?.image || null;
  if (chosenImage) {
    const img = document.createElement('img');
    img.src = chosenImage;
    img.alt = `${category} storage location`;
    imageWrapper.appendChild(img);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'category-card__placeholder';
    placeholder.textContent = category.slice(0, 1).toUpperCase() || '?';
    placeholder.setAttribute('aria-hidden', 'true');
    imageWrapper.appendChild(placeholder);
  }

  const titleWrap = document.createElement('div');
  titleWrap.className = 'category-card__title';
  const title = document.createElement('h3');
  title.textContent = category;
  const meta = document.createElement('div');
  meta.className = 'category-card__meta';
  meta.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  titleWrap.append(title, meta);

  const chevron = document.createElement('span');
  chevron.className = 'category-card__chevron';
  chevron.textContent = state.expanded.has(category) ? '▾' : '▸';

  header.append(imageWrapper, titleWrap, chevron);

  const body = document.createElement('div');
  body.className = 'category-card__body';
  body.style.display = state.expanded.has(category) ? 'grid' : 'none';
  const bodyId = `category-body-${normalizeCategoryKey(category)}`;
  body.id = bodyId;
  header.setAttribute('aria-controls', bodyId);

  items.forEach(item => body.appendChild(renderItemCard(item, chosenImage)));

  header.addEventListener('click', () => {
    const isOpen = state.expanded.has(category);
    if (isOpen) {
      state.expanded.delete(category);
    } else {
      state.expanded.add(category);
    }
    chevron.textContent = state.expanded.has(category) ? '▾' : '▸';
    body.style.display = state.expanded.has(category) ? 'grid' : 'none';
    header.setAttribute('aria-expanded', state.expanded.has(category) ? 'true' : 'false');
  });

  card.append(header, body);
  return card;
}

function matchesFilter(item) {
  const snap = snapshotFor(item);
  if (state.filter === 'in-stock') {
    return snap.rawQty > 0;
  }
  if (state.filter === 'needs-restock') {
    if (snap.coverageWeeks === null) return false;
    const weeklyUse = snap.weeklyConsumption || 0;
    return weeklyUse > snap.coverageWeeks;
  }
  return true;
}

function renderCategories() {
  if (!state.items.length) {
    renderEmpty('No inventory tracked yet.');
    return;
  }
  const grouped = new Map();
  state.items.forEach(item => {
    if (!matchesFilter(item)) return;
    const key = item.category || 'Other';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });

  if (!grouped.size) {
    renderEmpty('Everything is out of stock. Switch to "All Tracked" to view all items.');
    return;
  }

  categoryGrid.innerHTML = '';
  grouped.forEach((items, category) => {
    const card = renderCategoryCard(category, items);
    categoryGrid.appendChild(card);
  });
}

async function loadInventory() {
  try {
    statusWeek.textContent = `Week ${state.currentWeek}`;
    state.items = await loadTimelineItems();
    const locationImageMap = await loadLocationImages();
    state.locationImages = locationImageMap;
    state.snapshots.clear();
    state.hasLoaded = true;
    renderCategories();
  } catch (error) {
    console.error('Unable to load inventory timeline', error);
    renderEmpty('Failed to load inventory. Please try again.');
  } finally {
    loadingState?.remove();
  }
}

async function loadLocationImages() {
  try {
    return await new Promise((resolve) => {
      chrome.storage.local.get('storageLocationImages', (data) => {
        const entries = Object.entries(data.storageLocationImages || {});
        const map = new Map(entries.map(([key, value]) => [normalizeCategoryKey(key), value]));
        resolve(map);
      });
    });
  } catch (e) {
    return new Map();
  }
}

function setFilter(filter) {
  state.filter = filter;
  const buttons = [filterInStock, filterNeedsRestock, filterAll];
  buttons.forEach((btn) => {
    if (!btn) return;
    const value = btn.getAttribute('data-filter');
    btn.classList.toggle('pill-btn--active', value === filter);
  });
  if (state.hasLoaded) {
    renderCategories();
  }
}

function wireFilters() {
  [filterInStock, filterNeedsRestock, filterAll].forEach((btn) => {
    btn?.addEventListener('click', () => {
      const value = btn.getAttribute('data-filter');
      setFilter(value);
    });
  });
}

function wireFooter() {
  document.getElementById('footerSettings')?.addEventListener('click', () => {
    openSettings();
  });
  document.getElementById('footerSave')?.addEventListener('click', () => {
    triggerBackendAction('backupBtn');
  });
}

function openSettings() {
  if (!settingsPanel || !settingsScrim) return;
  settingsPanel.classList.add('settings-panel--open');
  settingsPanel.setAttribute('aria-hidden', 'false');
  settingsScrim.classList.add('settings-scrim--active');
  settingsScrim.setAttribute('aria-hidden', 'false');
}

function closeSettingsPanel() {
  if (!settingsPanel || !settingsScrim) return;
  settingsPanel.classList.remove('settings-panel--open');
  settingsPanel.setAttribute('aria-hidden', 'true');
  settingsScrim.classList.remove('settings-scrim--active');
  settingsScrim.setAttribute('aria-hidden', 'true');
}

function triggerBackendAction(buttonId) {
  if (!buttonId) return;
  const invoke = () => {
    const doc = backendFrame?.contentDocument;
    const btn = doc?.getElementById(buttonId);
    if (btn) {
      btn.click();
    } else {
      openOrFocusWindow('inventoryTimeline.html');
    }
  };
  if (backendFrame?.contentDocument?.readyState === 'complete') {
    invoke();
  } else if (backendFrame) {
    backendFrame.addEventListener('load', invoke, { once: true });
  }
}

function wireSettingsPanel() {
  closeSettings?.addEventListener('click', closeSettingsPanel);
  settingsScrim?.addEventListener('click', closeSettingsPanel);
  openClassicTimeline?.addEventListener('click', () => {
    openOrFocusWindow('inventoryTimeline.html');
  });

  document.querySelectorAll('[data-backend-action]').forEach(btn => {
    const action = btn.getAttribute('data-backend-action');
    btn.addEventListener('click', () => triggerBackendAction(action));
  });
}

wireFilters();
wireFooter();
wireSettingsPanel();
setFilter(state.filter);
loadInventory();

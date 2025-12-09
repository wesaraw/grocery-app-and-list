const tabs = [
  { id: 'price-checker', label: 'Price Checker', short: 'PC', src: 'popup.html' },
  { id: 'inventory-timeline', label: 'Inventory Timeline', short: 'IT', src: 'inventoryTimelineNew.html' },
  { id: 'meal-planner', label: 'Meal Planner', short: 'MP', src: 'mealPlanner.html' },
  { id: 'calendar', label: 'Calendar', short: 'CA', src: 'whatToEatCalendar.html' },
  { id: 'pack-count-repair', label: 'Pack Count Repair', short: 'PR', src: 'packCountRepair.html' },
];

const LAST_TAB_KEY = 'shell:lastActiveTab';
const DEFAULT_TAB_ID = 'inventory-timeline';

const contentEl = document.getElementById('content');
const tabBarEl = document.getElementById('tabBar');
const emptyStateEl = document.getElementById('emptyState');

function createTabButton(tab) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tab-button';
  button.dataset.tab = tab.id;
  button.title = tab.label;

  const icon = document.createElement('span');
  icon.className = 'tab-icon';
  icon.textContent = tab.short;

  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = tab.label;

  button.append(icon, label);
  button.addEventListener('click', () => activateTab(tab.id));

  return button;
}

function ensureFrame(tab) {
  let frame = contentEl.querySelector(`iframe[data-tab="${tab.id}"]`);
  if (!frame) {
    frame = document.createElement('iframe');
    frame.dataset.tab = tab.id;
    frame.className = 'feature-frame hidden';
    frame.loading = 'lazy';
    frame.src = tab.src;
    frame.allow = 'clipboard-read; clipboard-write';
    contentEl.appendChild(frame);
  }
  return frame;
}

let activeTabId = null;

async function persistActiveTab(id) {
  if (!chrome?.storage?.local?.set) return;
  try {
    await chrome.storage.local.set({ [LAST_TAB_KEY]: id });
  } catch (error) {
    console.warn('Unable to persist tab', error);
  }
}

async function restoreLastTab() {
  if (!chrome?.storage?.local?.get) return null;
  try {
    const stored = await chrome.storage.local.get(LAST_TAB_KEY);
    const candidate = stored?.[LAST_TAB_KEY];
    return typeof candidate === 'string' ? candidate : null;
  } catch (error) {
    console.warn('Unable to restore tab', error);
    return null;
  }
}

async function activateTab(id) {
  if (id === activeTabId) return;
  const nextTab = tabs.find((tab) => tab.id === id);
  if (!nextTab) return;

  emptyStateEl?.classList.add('hidden');
  ensureFrame(nextTab);

  const frames = contentEl.querySelectorAll('.feature-frame');
  frames.forEach((frame) => {
    const isActive = frame.dataset.tab === id;
    frame.classList.toggle('hidden', !isActive);
  });

  const buttons = tabBarEl.querySelectorAll('.tab-button');
  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === id);
  });

  activeTabId = id;
  await persistActiveTab(id);
}

async function initTabs() {
  const fragment = document.createDocumentFragment();
  tabs.forEach((tab) => {
    fragment.appendChild(createTabButton(tab));
  });
  tabBarEl.appendChild(fragment);

  if (tabs.length > 0) {
    const lastTab = await restoreLastTab();
    const fallbackId =
      tabs.find((t) => t.id === DEFAULT_TAB_ID)?.id ?? tabs[0]?.id ?? null;
    const initialId = tabs.some((t) => t.id === lastTab) ? lastTab : fallbackId;
    if (initialId) {
      activateTab(initialId);
    }
  }
}

initTabs();

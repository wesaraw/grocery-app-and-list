import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import {
  loadArray as loadItemArray,
  saveArray as saveItemArray,
  convertArrayToNames
} from './utils/itemStorage.js';
import {
  DEFAULT_ORDER_CAP_PERCENT,
  ITEM_CAP_PROPERTY,
  loadCategoryCaps,
  normalizeCapPercent,
  saveCategoryCaps,
} from './utils/orderCapSettings.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const NEEDS_KEY = 'yearlyNeeds';

let filterText = '';
const headerState = {};
let allNeeds = [];
let needsRecords = [];
let categoryCaps = {};
let container;

async function loadNeeds() {
  const arr = await loadItemArray(NEEDS_KEY);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(NEEDS_PATH);
  return await convertArrayToNames(fromJson);
}

function saveNeeds(arr) {
  return saveItemArray(NEEDS_KEY, arr);
}

async function init() {
  container = document.getElementById('categories');
  const [loadedNeeds, loadedCaps] = await Promise.all([
    loadNeeds(),
    loadCategoryCaps(),
  ]);
  needsRecords = loadedNeeds;
  categoryCaps = loadedCaps;

  function getCategoryKey(categoryName) {
    const trimmed = (categoryName || '').trim();
    return trimmed || 'Other';
  }

  function getCategoryCap(categoryName) {
    const key = getCategoryKey(categoryName);
    const stored = normalizeCapPercent(categoryCaps[key]);
    return stored !== null ? stored : DEFAULT_ORDER_CAP_PERCENT;
  }

  function getEffectiveCap(item) {
    const override = normalizeCapPercent(item[ITEM_CAP_PROPERTY]);
    if (override !== null) {
      return override;
    }
    return getCategoryCap(item.category);
  }

  function createRow(item) {
    const div = document.createElement('div');
    div.className = 'item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = `${item.name} - ${item.category || ''}`;
    div.appendChild(nameSpan);

    const categoryInput = document.createElement('input');
    categoryInput.type = 'text';
    categoryInput.placeholder = 'Category';
    categoryInput.className = 'category-input';
    categoryInput.addEventListener('keydown', async e => {
      if (e.key === 'Enter') {
        const val = categoryInput.value.trim();
        const rec = needsRecords.find(n => n.name === item.name);
        if (rec) {
          rec.category = val;
          nameSpan.textContent = `${item.name} - ${rec.category || ''}`;
          categoryInput.value = '';
          await saveNeeds(needsRecords);
          render();
        }
      }
    });
    div.appendChild(categoryInput);

    const capWrapper = document.createElement('span');
    capWrapper.className = 'cap-input-wrapper';

    const capInput = document.createElement('input');
    capInput.type = 'number';
    capInput.min = '0';
    capInput.step = '1';
    capInput.className = 'item-cap-input';
    const effectiveCap = getEffectiveCap(item);
    const itemOverride = normalizeCapPercent(item[ITEM_CAP_PROPERTY]);
    capInput.value = (itemOverride ?? effectiveCap).toString();
    capInput.placeholder = effectiveCap.toString();
    capInput.dataset.override = itemOverride !== null ? 'true' : 'false';
    capInput.dataset.effective = effectiveCap.toString();
    capInput.title = `Effective cap: ${effectiveCap}%`;
    ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend'].forEach(evt => {
      capInput.addEventListener(evt, e => e.stopPropagation());
    });
    capInput.addEventListener('change', async e => {
      e.stopPropagation();
      const rec = needsRecords.find(n => n.name === item.name);
      if (!rec) {
        return;
      }
      const raw = capInput.value.trim();
      const normalized = normalizeCapPercent(raw);
      if (normalized === null) {
        delete rec[ITEM_CAP_PROPERTY];
      } else {
        rec[ITEM_CAP_PROPERTY] = normalized;
      }
      await saveNeeds(needsRecords);
      render();
    });
    capWrapper.appendChild(capInput);

    const capSuffix = document.createElement('span');
    capSuffix.className = 'cap-suffix';
    capSuffix.textContent = '%';
    capWrapper.appendChild(capSuffix);

    div.appendChild(capWrapper);

    return div;
  }

  function decorateHeader(headerElement, categoryName) {
    headerElement.classList.add('category-header-with-input');
    const existingLabel = headerElement.querySelector('.category-header-label');
    if (existingLabel) {
      existingLabel.classList.add('category-header-text');
    }

    const capWrapper = document.createElement('span');
    capWrapper.className = 'cap-input-wrapper';

    const capInput = document.createElement('input');
    capInput.type = 'number';
    capInput.min = '0';
    capInput.step = '1';
    capInput.className = 'category-cap-input';
    const stored = normalizeCapPercent(categoryCaps[getCategoryKey(categoryName)]);
    const displayValue = stored !== null ? stored : DEFAULT_ORDER_CAP_PERCENT;
    capInput.value = displayValue.toString();
    capInput.placeholder = DEFAULT_ORDER_CAP_PERCENT.toString();
    capInput.dataset.override = stored !== null ? 'true' : 'false';
    capInput.title = 'Maximum percent of weekly need for this category';

    const stop = event => event.stopPropagation();
    ['click', 'mousedown', 'mouseup', 'dblclick', 'input', 'touchstart', 'touchend'].forEach(evt => {
      capInput.addEventListener(evt, stop);
    });

    capInput.addEventListener('change', async () => {
      const normalized = normalizeCapPercent(capInput.value.trim());
      const key = getCategoryKey(categoryName);
      if (normalized === null) {
        delete categoryCaps[key];
      } else {
        categoryCaps[key] = normalized;
      }
      await saveCategoryCaps(categoryCaps);
      render();
    });

    const capSuffix = document.createElement('span');
    capSuffix.className = 'cap-suffix';
    capSuffix.textContent = '%';

    capWrapper.appendChild(capInput);
    capWrapper.appendChild(capSuffix);
    headerElement.appendChild(capWrapper);
  }

  function render() {
    allNeeds = sortItemsByCategory(needsRecords);
    container.innerHTML = '';
    const arr = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    renderItemsWithCategoryHeaders(arr, container, createRow, headerState, {
      decorateHeader,
    });
  }

  render();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

document.addEventListener('DOMContentLoaded', init);

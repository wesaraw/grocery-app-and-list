import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import {
  loadArray as loadItemArray,
  saveArray as saveItemArray,
  convertArrayToNames
} from './utils/itemStorage.js';
import {
  DEFAULT_ORDER_CAP,
  loadCategoryCaps,
  saveCategoryCaps,
  loadItemCaps,
  saveItemCaps,
  percentToMultiplier,
  multiplierToPercent
} from './utils/orderCapStorage.js';

const NEEDS_PATH = 'data/required-for-grocery-app/yearly_needs_with_manual_flags.json';

const NEEDS_KEY = 'yearlyNeeds';

let filterText = '';
const headerState = {};
let allNeeds = [];
let container;
let needsData = [];
let categoryCaps = {};
let itemCaps = {};

async function loadNeeds() {
  const arr = await loadItemArray(NEEDS_KEY);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(NEEDS_PATH);
  return await convertArrayToNames(fromJson);
}

function saveNeeds(arr) {
  return saveItemArray(NEEDS_KEY, arr);
}

function categoryKey(name) {
  return name && name.trim() ? name : 'Other';
}

function formatPercentValue(multiplier) {
  const percent = multiplierToPercent(multiplier);
  if (!Number.isFinite(percent)) return '';
  if (Math.abs(percent - Math.round(percent)) < 0.01) {
    return String(Math.round(percent));
  }
  return percent.toFixed(1).replace(/\.0$/, '');
}

function getCategoryMultiplier(categoryName) {
  const key = categoryKey(categoryName);
  return categoryCaps[key] != null ? categoryCaps[key] : DEFAULT_ORDER_CAP;
}

function decorateHeader(headerEl, categoryName, render) {
  const key = categoryKey(categoryName);
  const wrapper = document.createElement('span');
  wrapper.className = 'category-cap-control';

  const label = document.createElement('label');
  label.className = 'cap-field';
  label.textContent = 'Cap %';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '1';
  input.className = 'cap-input';
  const current = categoryCaps[key] != null ? categoryCaps[key] : DEFAULT_ORDER_CAP;
  input.value = formatPercentValue(current);

  const stop = e => e.stopPropagation();
  wrapper.addEventListener('click', stop);
  input.addEventListener('click', stop);
  input.addEventListener('input', stop);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
    e.stopPropagation();
  });

  input.addEventListener('change', async () => {
    const multiplier = percentToMultiplier(input.value);
    const updated = { ...categoryCaps };
    if (multiplier == null || Math.abs(multiplier - DEFAULT_ORDER_CAP) < 0.0001) {
      delete updated[key];
    } else {
      updated[key] = multiplier;
    }
    categoryCaps = updated;
    await saveCategoryCaps(categoryCaps);
    render();
  });

  label.appendChild(input);
  wrapper.appendChild(label);
  headerEl.appendChild(wrapper);
}

function createRow(item, render) {
  const div = document.createElement('div');
  div.className = 'item';

  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = `${item.name} - ${categoryKey(item.category)}`;
  div.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'item-controls';

  const categoryInput = document.createElement('input');
  categoryInput.type = 'text';
  categoryInput.placeholder = 'Category';
  categoryInput.className = 'category-input';
  categoryInput.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = categoryInput.value.trim();
      const rec = needsData.find(n => n.name === item.name);
      if (rec) {
        rec.category = val;
        await saveNeeds(needsData);
        allNeeds = sortItemsByCategory(needsData);
        categoryInput.value = '';
        render();
      }
    }
  });
  controls.appendChild(categoryInput);

  const capLabel = document.createElement('label');
  capLabel.className = 'cap-field';
  capLabel.textContent = 'Cap %';

  const capInput = document.createElement('input');
  capInput.type = 'number';
  capInput.min = '0';
  capInput.step = '1';
  capInput.className = 'cap-input';
  const baseMultiplier = getCategoryMultiplier(item.category);
  const override = itemCaps[item.name];
  const currentMultiplier = override != null ? override : baseMultiplier;
  capInput.value = formatPercentValue(currentMultiplier);
  capInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      capInput.blur();
    }
  });
  capInput.addEventListener('change', async () => {
    const multiplier = percentToMultiplier(capInput.value);
    const updated = { ...itemCaps };
    if (multiplier == null || Math.abs(multiplier - baseMultiplier) < 0.0001) {
      delete updated[item.name];
    } else {
      updated[item.name] = multiplier;
    }
    itemCaps = updated;
    await saveItemCaps(itemCaps);
    render();
  });
  capLabel.appendChild(capInput);
  controls.appendChild(capLabel);

  div.appendChild(controls);
  return div;
}

async function init() {
  container = document.getElementById('categories');
  const [needs, catCaps, itmCaps] = await Promise.all([
    loadNeeds(),
    loadCategoryCaps(),
    loadItemCaps()
  ]);
  needsData = needs;
  categoryCaps = catCaps;
  itemCaps = itmCaps;
  allNeeds = sortItemsByCategory(needsData);

  function render() {
    container.innerHTML = '';
    const arr = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    renderItemsWithCategoryHeaders(
      arr,
      container,
      current => createRow(current, render),
      headerState,
      {
        decorateHeader: (headerEl, categoryName) =>
          decorateHeader(headerEl, categoryName, render)
      }
    );
  }

  render();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

document.addEventListener('DOMContentLoaded', init);

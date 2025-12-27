import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory } from './utils/sortByCategory.js';
import { convert } from './utils/uomConverter.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { initializeMealCategories, MEAL_TYPES } from './utils/mealData.js';
import { canonicalName } from './utils/nameUtils.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { parseQuantity } from './utils/calendarUtils.js';
import { normalizeUnit } from './utils/priceUtils.js';

const NEEDS_PATH = 'data/required-for-grocery-app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'data/required-for-grocery-app/monthly_consumption_table.json';
const STOCK_PATH = 'data/required-for-grocery-app/current_stock_table.json';

let filterText = '';
const headerState = {};
let allNeeds = [];
let tbody;
let itemUsageMap = new Map();
let itemMealUnitMap = new Map();
let finalUnitMap = new Map();

function normalizeUnitType(unit, sourceText = '') {
  if (!unit && !sourceText) return null;
  const raw = unit ? `${unit}` : '';
  const text = raw.trim().toLowerCase();
  const source = sourceText ? sourceText.toLowerCase() : '';
  const base = text.replace(/\./g, '').replace(/\s+/g, ' ').trim();
  const collapsed = base.replace(/\s+/g, '');
  const ALIASES = {
    each: 'ea',
    ea: 'ea',
    unit: 'ea',
    units: 'ea',
    count: 'ea',
    ct: 'ea',
    pk: 'ea',
    pack: 'ea',
    packs: 'ea',
    package: 'ea',
    packages: 'ea',
    pkg: 'ea',
    floz: 'fl oz',
    'fl oz': 'fl oz',
    'fluid ounce': 'fl oz',
    'fluid ounces': 'fl oz',
    gallon: 'gal',
    gallons: 'gal',
    gal: 'gal',
    quart: 'qt',
    quarts: 'qt',
    qt: 'qt',
    pint: 'pt',
    pints: 'pt',
    pt: 'pt',
    ounce: 'oz',
    ounces: 'oz',
    oz: 'oz',
    pound: 'lb',
    pounds: 'lb',
    lbs: 'lb',
    lb: 'lb',
    gram: 'g',
    grams: 'g',
    g: 'g',
    kilogram: 'kg',
    kilograms: 'kg',
    kg: 'kg',
    milliliter: 'ml',
    milliliters: 'ml',
    ml: 'ml',
    liter: 'l',
    liters: 'l',
    litre: 'l',
    litres: 'l',
    l: 'l',
    bag: 'bag',
    bags: 'bag',
    box: 'box',
    boxes: 'box',
    jar: 'jar',
    jars: 'jar',
    bottle: 'bottle',
    bottles: 'bottle',
    stick: 'stick',
    sticks: 'stick',
    cup: 'cup',
    cups: 'cup',
    tbsp: 'tbsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    tsp: 'tsp',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    dash: 'dash',
    pinch: 'pinch',
    sheet: 'sheet',
    sheets: 'sheet'
  };

  const aliasLookup = value => {
    if (!value) return null;
    if (ALIASES[value]) return ALIASES[value];
    return null;
  };

  let result = aliasLookup(base) || aliasLookup(collapsed);

  if (!result && base === 'fl' && /\bfl\s*oz\b/.test(source)) {
    result = 'fl oz';
  }
  if (!result && /\bfluid\s+ounce/.test(source)) {
    result = 'fl oz';
  }

  if (!result) {
    const normalized = normalizeUnit(text || source.replace(/.*?([a-zA-Z]+)/, '$1'));
    result = aliasLookup(normalized) || normalized;
  }

  if (!result && source) {
    const sizeMatch = source.match(/([a-z]+\s*[a-z]+)$/i);
    if (sizeMatch) {
      const cleaned = sizeMatch[1].replace(/\./g, '').toLowerCase();
      result = aliasLookup(cleaned) || aliasLookup(cleaned.replace(/\s+/g, '')) || cleaned;
    }
  }

  return result || null;
}

const WEIGHT_UNITS = new Set(['oz', 'lb', 'g', 'kg', 'mg']);
const VOLUME_UNITS = new Set([
  'ml',
  'l',
  'fl oz',
  'cup',
  'tbsp',
  'tsp',
  'pt',
  'qt',
  'gal',
  'dl',
  'cl'
]);
const COUNT_UNITS = new Set([
  'ea',
  'bag',
  'box',
  'jar',
  'bottle',
  'stick',
  'slice',
  'sheet',
  'dash',
  'pinch',
  'can',
  'pack',
  'pkg'
]);

function getUnitCategory(unit) {
  if (!unit) return 'unknown';
  if (WEIGHT_UNITS.has(unit)) return 'weight';
  if (VOLUME_UNITS.has(unit)) return 'volume';
  if (COUNT_UNITS.has(unit)) return 'count';
  return 'unknown';
}

function areUnitsCompatible(a, b) {
  if (!a || !b) return true;
  if (a === b) return true;
  const catA = getUnitCategory(a);
  const catB = getUnitCategory(b);
  if (catA === 'unknown' || catB === 'unknown') return false;
  const isWeightOrVolume = category => category === 'weight' || category === 'volume';
  if (isWeightOrVolume(catA) && isWeightOrVolume(catB)) {
    return true;
  }
  if (catA === catB) {
    // Only identical discrete units are compatible; handled above.
    return false;
  }
  return false;
}

async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  if (!path) return arr;
  const fromJson = await loadJSON(path);
  return await convertArrayToNames(fromJson);
}

function save(key, value) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}

function loadFromStorage(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, data => resolve(data || {}));
  });
}

function extractFinalUnit(product = {}) {
  const tryNormalize = (value, source = '') =>
    normalizeUnitType(value, source || value) || null;

  const fromUnitType = tryNormalize(product.unitType);
  if (fromUnitType) return fromUnitType;

  const fromSizeUnit = tryNormalize(product.sizeUnit, product.size);
  if (fromSizeUnit) return fromSizeUnit;

  if (product.size) {
    const parsed = parseQuantity(product.size);
    const fromSize = tryNormalize(parsed.unit, product.size);
    if (fromSize) return fromSize;
  }

  if (product.unit) {
    const parsed = parseQuantity(product.unit);
    const fromUnit = tryNormalize(parsed.unit, product.unit);
    if (fromUnit) return fromUnit;
  }

  return null;
}

async function buildFinalUnitMap(items = []) {
  const map = new Map();
  if (!Array.isArray(items) || items.length === 0) {
    finalUnitMap = map;
    return map;
  }
  const keys = items.map(item => `final_product_${encodeURIComponent(item.name)}`);
  const storage = await loadFromStorage(keys);
  items.forEach(item => {
    if (!item || !item.name) return;
    const canon = canonicalName(item.name);
    if (!canon) return;
    const key = `final_product_${encodeURIComponent(item.name)}`;
    const product = storage[key];
    if (!product) return;
    const unit = extractFinalUnit(product);
    if (unit) {
      map.set(canon, unit);
    }
  });
  finalUnitMap = map;
  return map;
}

let needs = [];
let consumption = [];
let stock = [];
let rows = [];

async function buildItemUsageMap() {
  const usage = new Map();
  const mealUnits = new Map();
  const entries = Object.entries(MEAL_TYPES || {});
  await Promise.all(
    entries.map(async ([typeId, info]) => {
      if (!info || !info.key) return;
      const meals = await loadArray(info.key, info.path);
      meals.forEach(meal => {
        const mealName = meal?.name;
        if (!mealName) return;
        const recipeBook = meal.recipeBook || '';
        const typeLabel = info.label || typeId;
        const ingredients = Array.isArray(meal.ingredients)
          ? meal.ingredients
          : [];
        ingredients.forEach(ing => {
          const itemName = ing?.name;
          if (!itemName) return;
          const canon = canonicalName(itemName);
          if (!canon) return;
          if (!usage.has(canon)) usage.set(canon, []);
          usage.get(canon).push({
            typeId,
            typeLabel,
            recipeBook,
            mealName
          });
          const quantityText = ing?.serving_size || ing?.amount || '';
          const parsed = parseQuantity(quantityText);
          const mealUnit =
            normalizeUnitType(parsed.unit, quantityText) ||
            normalizeUnitType(ing?.unit, ing?.unit);
          if (mealUnit) {
            if (!mealUnits.has(canon)) mealUnits.set(canon, new Set());
            mealUnits.get(canon).add(mealUnit);
          }
        });
      });
    })
  );
  itemUsageMap = usage;
  itemMealUnitMap = mealUnits;
}

function updateSaveVisibility(row) {
  const newUnit = row.input.value.trim();
  const unitChanged = newUnit && newUnit !== row.item.home_unit;
  const wholeChanged = row.chk.checked !== row.item.treat_as_whole_unit;
  if (unitChanged || wholeChanged) {
    row.saveBtn.classList.remove('hidden');
  } else {
    row.saveBtn.classList.add('hidden');
  }
}

function updateUnitWarning(row) {
  if (!row || !row.warning) return;
  const warning = row.warning;
  const canon = canonicalName(row.item.name);
  const mealUnitSet = itemMealUnitMap.get(canon);
  const mealUnits = mealUnitSet ? Array.from(mealUnitSet).sort() : [];
  const finalUnit = finalUnitMap.get(canon) || null;
  const rawHome = row.item.home_unit;
  const homeUnit = normalizeUnitType(rawHome, rawHome);
  const reasonSet = new Set();

  if (!homeUnit && (mealUnits.length > 0 || finalUnit)) {
    reasonSet.add('Home unit is not set');
  }

  const units = [];
  if (homeUnit) units.push({ source: 'home', unit: homeUnit });
  mealUnits.forEach(unit => {
    units.push({ source: 'meal', unit });
  });
  if (finalUnit) units.push({ source: 'final', unit: finalUnit });

  const describe = (source, unit, capitalizeFirst = false) => {
    let phrase;
    if (source === 'meal') {
      phrase = `meal uses ${unit}`;
    } else if (source === 'home') {
      phrase = `home ${unit}`;
    } else if (source === 'final') {
      phrase = `final selection ${unit}`;
    } else {
      phrase = `${source} ${unit}`;
    }
    if (!capitalizeFirst) return phrase;
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
  };

  const sourceRank = source => {
    if (source === 'meal') return 0;
    if (source === 'final') return 1;
    if (source === 'home') return 2;
    return 3;
  };

  for (let i = 0; i < units.length; i += 1) {
    for (let j = i + 1; j < units.length; j += 1) {
      const a = units[i];
      const b = units[j];
      if (!areUnitsCompatible(a.unit, b.unit)) {
        const pair = [a, b].sort((x, y) => {
          const rankDiff = sourceRank(x.source) - sourceRank(y.source);
          if (rankDiff !== 0) return rankDiff;
          return x.unit.localeCompare(y.unit);
        });
        const [first, second] = pair;
        const message = `${describe(first.source, first.unit, true)} vs. ${describe(
          second.source,
          second.unit
        )}`;
        reasonSet.add(message);
      }
    }
  }

  const reasons = Array.from(reasonSet);
  const show = reasons.length > 0;
  if (show) {
    warning.classList.remove('hidden');
    warning.setAttribute('aria-hidden', 'false');
    warning.title = `Unit mismatch: ${reasons.join('; ')}`;
  } else {
    warning.classList.add('hidden');
    warning.setAttribute('aria-hidden', 'true');
    warning.removeAttribute('title');
  }
}

function buildRow(item) {
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'item-name-toggle';
  toggleBtn.textContent = item.name;
  toggleBtn.setAttribute('aria-expanded', 'false');
  nameTd.appendChild(toggleBtn);
  const warning = document.createElement('span');
  warning.className = 'unit-warning hidden';
  warning.textContent = '⚠️';
  warning.setAttribute('role', 'img');
  warning.setAttribute('aria-label', 'Unit mismatch warning');
  warning.setAttribute('aria-hidden', 'true');
  nameTd.appendChild(warning);
  const homeTd = document.createElement('td');
  homeTd.textContent = item.home_unit;
  const inputTd = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  inputTd.appendChild(input);
  const wholeTd = document.createElement('td');
  wholeTd.textContent = item.treat_as_whole_unit;
  const checkTd = document.createElement('td');
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.checked = item.treat_as_whole_unit;
  checkTd.appendChild(chk);
  const saveTd = document.createElement('td');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'hidden';
  saveTd.appendChild(saveBtn);
  const detailTr = document.createElement('tr');
  detailTr.className = 'usage-row';
  detailTr.style.display = 'none';
  const detailTd = document.createElement('td');
  detailTd.colSpan = 6;
  detailTr.appendChild(detailTd);

  const usageList = itemUsageMap.get(canonicalName(item.name)) || [];
  if (usageList.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'no-usage';
    emptyMsg.textContent = 'No meals currently use this item.';
    detailTd.appendChild(emptyMsg);
  } else {
    const list = document.createElement('ul');
    list.className = 'usage-list';
    usageList
      .slice()
      .sort((a, b) => {
        const typeCmp = a.typeLabel.localeCompare(b.typeLabel);
        if (typeCmp !== 0) return typeCmp;
        const mealCmp = a.mealName.localeCompare(b.mealName);
        if (mealCmp !== 0) return mealCmp;
        return (a.recipeBook || '').localeCompare(b.recipeBook || '');
      })
      .forEach(entry => {
        const li = document.createElement('li');
        const linkBtn = document.createElement('button');
        linkBtn.type = 'button';
        linkBtn.className = 'usage-link';
        const bookText = entry.recipeBook ? ` (${entry.recipeBook})` : '';
        linkBtn.textContent = `${entry.typeLabel} — ${entry.mealName}${bookText}`;
        linkBtn.addEventListener('click', event => {
          event.stopPropagation();
          openOrFocusWindow(
            `mealListView.html?type=${entry.typeId}&meal=${encodeURIComponent(
              entry.mealName
            )}&book=${encodeURIComponent(entry.recipeBook || '')}`
          );
        });
        li.appendChild(linkBtn);
        list.appendChild(li);
      });
    detailTd.appendChild(list);
  }

  const row = {
    tr,
    detailRow: detailTr,
    input,
    chk,
    item,
    saveBtn,
    homeTd,
    wholeTd,
    toggleBtn,
    warning
  };

  input.addEventListener('input', () => updateSaveVisibility(row));
  chk.addEventListener('change', () => updateSaveVisibility(row));
  saveBtn.addEventListener('click', () => saveRow(row));

  toggleBtn.addEventListener('click', () => {
    const expanded = detailTr.style.display !== 'none';
    detailTr.style.display = expanded ? 'none' : '';
    toggleBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });

  tr.appendChild(nameTd);
  tr.appendChild(homeTd);
  tr.appendChild(inputTd);
  tr.appendChild(wholeTd);
  tr.appendChild(checkTd);
  tr.appendChild(saveTd);

  updateUnitWarning(row);

  return row;
}

function addCategoryRow(tbody, cat) {
  const tr = document.createElement('tr');
  const th = document.createElement('th');
  th.colSpan = 6;
  th.className = 'category-header';
  th.textContent = cat;
  tr.appendChild(th);
  tbody.appendChild(tr);
  return tr;
}

async function init() {
  [needs, consumption, stock] = await Promise.all([
    loadArray('yearlyNeeds', NEEDS_PATH),
    loadArray('monthlyConsumption', CONSUMPTION_PATH),
    loadArray('currentStock', STOCK_PATH)
  ]);
  await initializeMealCategories();
  await buildItemUsageMap();
  await buildFinalUnitMap(needs);
  tbody = document.getElementById('uom-list');
  allNeeds = sortItemsByCategory(needs);

  function render() {
    tbody.innerHTML = '';
    let lastCat = null;
    let headerRow = null;
    let itemRows = [];
    rows = [];
    const arr = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    function finalizeHeader(cat, row, rowsArr) {
      if (!row) return;
      const hidden =
        headerState[cat] !== undefined ? headerState[cat] : true;
      row.dataset.hidden = hidden ? 'true' : 'false';
      rowsArr.forEach(r => {
        r.style.display = hidden ? 'none' : '';
      });
      const th = row.querySelector('.category-header');
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const isHidden = row.dataset.hidden === 'true';
        row.dataset.hidden = isHidden ? 'false' : 'true';
        rowsArr.forEach(r => {
          r.style.display = isHidden ? '' : 'none';
        });
        headerState[cat] = !isHidden;
      });
    }

    arr.forEach(n => {
      const cat = n.category || 'Other';
      if (cat !== lastCat) {
        finalizeHeader(lastCat, headerRow, itemRows);
        lastCat = cat;
        headerRow = addCategoryRow(tbody, cat);
        itemRows = [];
      }
      const row = buildRow(n);
      rows.push(row);
      itemRows.push(row.tr, row.detailRow);
      tbody.appendChild(row.tr);
      tbody.appendChild(row.detailRow);
    });
    finalizeHeader(lastCat, headerRow, itemRows);
  }

  render();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

async function saveRow(row) {
  const newUnit = row.input.value.trim();
  const changedUnit = newUnit && newUnit !== row.item.home_unit;
  const changedWhole = row.chk.checked !== row.item.treat_as_whole_unit;
  if (!changedUnit && !changedWhole) return;

  if (changedUnit) {
    const oldUnit = row.item.home_unit;
    row.item.home_unit = newUnit;
    row.item.total_needed_year = convert(
      row.item.total_needed_year,
      oldUnit,
      newUnit
    );
    const cons = consumption.find(c => c.name === row.item.name);
    if (cons) {
      cons.monthly_consumption = convert(
        cons.monthly_consumption,
        oldUnit,
        newUnit
      );
      cons.unit = newUnit;
    }
    const st = stock.find(s => s.name === row.item.name);
    if (st) {
      st.amount = convert(st.amount, oldUnit, newUnit);
      st.unit = newUnit;
    }
    row.homeTd.textContent = newUnit;
  }
  if (changedWhole) {
    row.item.treat_as_whole_unit = row.chk.checked;
    row.wholeTd.textContent = row.item.treat_as_whole_unit;
  }

  await Promise.all([
    save('yearlyNeeds', needs),
    save('monthlyConsumption', consumption),
    save('currentStock', stock)
  ]);
  row.saveBtn.classList.add('hidden');
  updateUnitWarning(row);
}

document.addEventListener('DOMContentLoaded', init);

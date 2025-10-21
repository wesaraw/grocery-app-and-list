import {
  MEAL_TYPES,
  initializeMealCategories,
  loadWhatToCookVisibility,
  saveWhatToCookVisibility,
  WHAT_TO_COOK_VISIBILITY_KEY
} from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { loadUsers, loadUserPortionMultipliers } from './utils/userData.js';
import { canonicalName } from './utils/nameUtils.js';
import { parseQuantity } from './utils/calendarUtils.js';
import { initUomTable, convert } from './utils/uomConverter.js';
import {
  loadDensityMap,
  convertWithDensity,
  computeNormalizedQuantity
} from './utils/unitNormalize.js';
import { getPriceUnitInfo, sheetSqFtFor } from './utils/priceUtils.js';
import {
  loadArray as loadItemArray,
  saveArray as saveItemArray,
  convertArrayToNames,
  getItemNameMap,
  saveItemNameMap,
  nextUnusedItemId
} from './utils/itemStorage.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const expandedBooks = new Map();

const params = new URLSearchParams(location.search);
let type = params.get('type') || 'breakfast';
const focusMealParam = params.get('meal');
const focusMealName = focusMealParam ? canonicalName(focusMealParam) : null;
const focusBookParam = params.get('book');
const focusBook = focusBookParam !== null ? focusBookParam : null;
let focusHandled = false;
let key, path, label;

let whatToCookVisibility = {};
let visibilityCheckbox = null;
let suppressVisibilityChange = false;

function setVisibilityCheckboxState(checked) {
  if (!visibilityCheckbox) return;
  const normalized = !!checked;
  if (visibilityCheckbox.checked === normalized) return;
  suppressVisibilityChange = true;
  visibilityCheckbox.checked = normalized;
  suppressVisibilityChange = false;
}

let inventorySet = new Set();
const ingredientCells = {};
let userNames = [];
let userPortionDefaults = [];
let deleteMode = false;
const deleteButtons = [];
let needsMap = new Map();
let densityMap = {};
const UOM_PATH = 'Required for grocery app/uom_conversion_table.json';
let units = [];

function extractUnitText(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^[\d\s./+-]+(.*)$/);
  return match ? match[1].trim() : '';
}

function formatUnitLabel(text) {
  if (!text) return '';
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (lower === 'cooked' || lower === 'dry') {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      if (index === 0 && lower.length > 2) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }
      return part;
    })
    .join(' ');
}

function formatNormalizedQuantity(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  if (Number.isInteger(normalized)) return normalized.toString();
  return normalized
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

function formatIngredientAmount(ingredient) {
  const base = ingredient?.amount || ingredient?.serving_size || '';
  if (base == null) return '';
  const baseStr = typeof base === 'string' ? base.trim() : String(base);
  if (!baseStr) return '';
  const name = ingredient?.name;
  if (!name) return baseStr;
  const info = densityMap[name] || densityMap[canonicalName(name)];
  if (!info) return baseStr;
  const { value, unit } = parseQuantity(baseStr);
  if (!unit) return baseStr;
  const normalized = computeNormalizedQuantity(value, unit, info);
  if (!normalized || normalized.unit == null) return baseStr;
  const normalizedUnitRaw = typeof normalized.unit === 'string' ? normalized.unit.trim() : '';
  if (!normalizedUnitRaw) return baseStr;
  const normalizedUnit = formatUnitLabel(normalizedUnitRaw);
  if (!normalizedUnit) return baseStr;
  let baseUnitText = extractUnitText(baseStr);
  if (!baseUnitText && unit && unit !== 'ea') {
    baseUnitText = unit;
  }
  const formattedBaseUnit = formatUnitLabel(baseUnitText);
  if (
    formattedBaseUnit &&
    normalizedUnit.toLowerCase() === formattedBaseUnit.toLowerCase()
  ) {
    return baseStr;
  }
  const formattedQty = formatNormalizedQuantity(normalized.quantity);
  if (!formattedQty) return baseStr;
  return `${baseStr} (Converts to ${formattedQty} ${normalizedUnit})`;
}

function normalizeIngredientPrepFlags(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  ingredients.forEach(ing => {
    if (!ing || typeof ing !== 'object') return;
    if (ing.prepAhead === undefined) ing.prepAhead = false;
  });
  return ingredients;
}

function normalizeMealRecord(meal) {
  if (!meal || typeof meal !== 'object') return;
  if (meal.prepared === undefined) meal.prepared = false;
  if (meal.prepAhead === undefined) meal.prepAhead = false;
  if (meal.leftoverOk === undefined) meal.leftoverOk = false;
  if (meal.recipeBook === undefined) meal.recipeBook = '';
  if (!Array.isArray(meal.ingredients)) {
    meal.ingredients = [];
  }
  normalizeIngredientPrepFlags(meal.ingredients);
}

function sanitizeOverrides(source, userCount) {
  if (!Array.isArray(source) || userCount <= 0) return [];
  const sanitized = [];
  const limit = Math.min(source.length, userCount);
  for (let i = 0; i < limit; i++) {
    const val = source[i];
    let normalized;
    if (typeof val === 'number' && Number.isFinite(val)) {
      normalized = val;
    } else if (typeof val === 'string' && val.trim() !== '') {
      const parsed = Number(val);
      normalized = Number.isFinite(parsed) ? parsed : undefined;
    } else {
      normalized = undefined;
    }
    sanitized[i] = normalized;
  }
  let end = sanitized.length;
  while (end > 0 && sanitized[end - 1] === undefined) end--;
  return sanitized.slice(0, end);
}

function overridesEqual(a, b) {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  if (arrA.length !== arrB.length) return false;
  for (let i = 0; i < arrA.length; i++) {
    if (!Object.is(arrA[i], arrB[i])) return false;
  }
  return true;
}

function normalizeMealOverrides(meal) {
  const hasArray = Array.isArray(meal.userPortionOverrides);
  const sanitized = sanitizeOverrides(meal.userPortionOverrides, userNames.length);
  if (!hasArray && sanitized.length === 0 && meal.userPortionOverrides === undefined) {
    return false;
  }
  if (!hasArray || !overridesEqual(sanitized, meal.userPortionOverrides)) {
    meal.userPortionOverrides = sanitized;
    return true;
  }
  return false;
}

function defaultPortionFor(index) {
  const val = userPortionDefaults[index];
  return typeof val === 'number' && Number.isFinite(val) ? val : 1;
}

function sameMultiplier(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
}

function loadFinalProduct(item) {
  return new Promise(resolve => {
    const key = `final_product_${encodeURIComponent(item)}`;
    chrome.storage.local.get([key], data => resolve(data[key] || null));
  });
}

async function getMealImage(meal) {
  if (meal.image) return meal.image;
  const first = meal.ingredients?.[0]?.name;
  if (!first) return null;
  const prod = await loadFinalProduct(first);
  return prod && prod.image ? prod.image : null;
}

function setMealImage(imgEl, meal) {
  getMealImage(meal).then(src => {
    if (src) {
      imgEl.src = src;
      imgEl.style.display = 'inline';
    } else {
      imgEl.style.display = 'none';
      imgEl.src = '';
    }
  });
}

function createAddButton(name) {
  const btn = document.createElement('button');
  btn.textContent = 'add';
  btn.addEventListener('click', () => {
    openOrFocusWindow(`addItem.html?name=${encodeURIComponent(name)}`);
  });
  return btn;
}

async function loadMeals() {
  const arr = await loadItemArray(key);
  if (arr.length > 0) {
    arr.forEach(normalizeMealRecord);
    return arr;
  }
  const fromJson = await loadJSON(path);
  const withNames = await convertArrayToNames(fromJson);
  withNames.forEach(normalizeMealRecord);
  return withNames;
}

async function loadStock() {
  const arr = await loadItemArray('currentStock');
  if (arr.length > 0) return arr;
  const stock = await loadJSON(STOCK_PATH);
  return await convertArrayToNames(stock);
}

async function loadNeeds() {
  const arr = await loadItemArray('yearlyNeeds');
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(NEEDS_PATH);
  return await convertArrayToNames(fromJson);
}

async function loadUnits() {
  const data = await loadJSON(UOM_PATH);
  return Object.keys(data);
}

function saveMeals(arr) {
  return saveItemArray(key, arr);
}

function loadMealsForType(cat) {
  const info = MEAL_TYPES[cat];
  if (!info) return Promise.resolve([]);
  return (async () => {
    const arr = await loadItemArray(info.key);
    if (arr.length > 0) {
      arr.forEach(normalizeMealRecord);
      return arr;
    }
    const fromJson = await loadJSON(info.path);
    const withNames = await convertArrayToNames(fromJson);
    withNames.forEach(normalizeMealRecord);
    return withNames;
  })();
}

function saveMealsForType(cat, arr) {
  const info = MEAL_TYPES[cat];
  if (!info) return Promise.resolve();
  return saveItemArray(info.key, arr);
}

async function correctMealIdErrors() {
  await initializeMealCategories();
  const categories = Object.values(MEAL_TYPES).filter(info => info && info.key);
  const categoryData = await Promise.all(
    categories.map(async info => ({ info, meals: await loadItemArray(info.key) }))
  );
  const mealsByKey = new Map(categoryData.map(({ info, meals }) => [info.key, meals]));

  const originalMap = await getItemNameMap();
  const workingMap = { ...originalMap };
  const reverseMap = {};
  Object.entries(workingMap).forEach(([name, id]) => {
    if (id != null && reverseMap[id] == null) {
      reverseMap[id] = name;
    }
  });

  const idGroups = new Map();
  const missingIdEntries = [];
  const numericMealIds = [];

  categoryData.forEach(({ info, meals }) => {
    meals.forEach((meal, index) => {
      if (!meal || typeof meal !== 'object') return;
      const entry = { meal, info, index, meals };
      const rawId = meal.id;
      const id = rawId == null ? '' : String(rawId).trim();
      if (!id || !/^[0-9]+$/.test(id)) {
        missingIdEntries.push(entry);
        return;
      }
      numericMealIds.push(id);
      if (!idGroups.has(id)) {
        idGroups.set(id, []);
      }
      idGroups.get(id).push(entry);
    });
  });

  let nextSeed = parseInt(nextUnusedItemId(workingMap, numericMealIds), 10);
  if (!Number.isFinite(nextSeed)) {
    nextSeed = 1;
  }
  let maxId = nextSeed - 1;

  let mealsUpdated = 0;
  let mapUpdates = 0;
  const dirtyKeys = new Set();

  const ensureMap = (name, id) => {
    if (!name) return;
    const strId = String(id);
    if (workingMap[name] !== strId) {
      workingMap[name] = strId;
      mapUpdates += 1;
    }
  };

  const setReverse = (id, name) => {
    if (!id || !name) return;
    reverseMap[id] = name;
  };

  const allocateNewId = () => {
    maxId += 1;
    return String(maxId);
  };

  const canonical = value => canonicalName(value || '');

  for (const [id, entries] of idGroups.entries()) {
    if (entries.length === 0) continue;
    if (entries.length === 1) {
      const [entry] = entries;
      const normalizedId = String(entry.meal.id ?? id);
      ensureMap(entry.meal.name, normalizedId);
      setReverse(normalizedId, entry.meal.name);
      continue;
    }
    const keeperName = reverseMap[id];
    const keeperCanonical = keeperName ? canonical(keeperName) : null;
    let keeper = null;
    if (keeperCanonical) {
      keeper = entries.find(e => canonical(e.meal.name) === keeperCanonical) || null;
    }
    if (!keeper) {
      keeper = entries[0];
    }
    entries.forEach(entry => {
      if (entry === keeper) {
        const normalizedId = String(entry.meal.id ?? id);
        ensureMap(entry.meal.name, normalizedId);
        setReverse(normalizedId, entry.meal.name);
        return;
      }
      const newId = allocateNewId();
      entry.meal.id = newId;
      ensureMap(entry.meal.name, newId);
      setReverse(newId, entry.meal.name);
      dirtyKeys.add(entry.info.key);
      mealsUpdated += 1;
    });
  }

  missingIdEntries.forEach(entry => {
    const newId = allocateNewId();
    entry.meal.id = newId;
    ensureMap(entry.meal.name, newId);
    setReverse(newId, entry.meal.name);
    dirtyKeys.add(entry.info.key);
    mealsUpdated += 1;
  });

  idGroups.forEach(entries => {
    entries.forEach(entry => {
      ensureMap(entry.meal.name, entry.meal.id);
      setReverse(String(entry.meal.id), entry.meal.name);
    });
  });
  missingIdEntries.forEach(entry => {
    ensureMap(entry.meal.name, entry.meal.id);
    setReverse(String(entry.meal.id), entry.meal.name);
  });

  const mapChanged = mapUpdates > 0;
  const mealsChanged = mealsUpdated > 0;

  if (mealsChanged) {
    await Promise.all(
      Array.from(dirtyKeys).map(async mealKey => {
        const list = mealsByKey.get(mealKey);
        if (list) {
          await saveItemArray(mealKey, list);
        }
      })
    );
  }

  if (mapChanged) {
    await saveItemNameMap(workingMap);
  }

  if (mealsChanged || mapChanged) {
    await calculateAndSaveMealNeeds();
  }

  return { mealsUpdated, mapUpdates };
}

function pricePerHomeUnit(itemName, product) {
  const item = needsMap.get(canonicalName(itemName));
  if (!item || !product || product.priceNumber == null) return null;
  const info = densityMap[itemName] || {};
  const pack = product.packCount && product.packCount > 1 ? product.packCount : 1;
  const unit = item.home_unit ? item.home_unit.toLowerCase() : 'each';
  if (unit === 'sheets') {
    const sheetSqFt = sheetSqFtFor(itemName);
    const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
    if (ppu != null && ut) {
      if (/^(?:sf|sqft)$/.test(ut)) {
        return ppu * sheetSqFt;
      }
      if (/ct|count|sheet/.test(ut)) {
        return ppu;
      }
    }
    const totalSheets = product.sizeQty && /sheet/i.test(product.sizeUnit || '')
      ? product.sizeQty
      : null;
    if (totalSheets && product.priceNumber != null) {
      return product.priceNumber / (totalSheets * pack);
    }
  }
  if (unit === 'each') {
    return product.priceNumber / pack;
  }
  let { pricePerUnit: pricePerOz, unitType } = getPriceUnitInfo(product);
  if (pricePerOz == null) {
    let ozQty = null;
    if (product.convertedQty != null) {
      ozQty = product.convertedQty * pack;
    } else if (product.sizeQty != null && product.sizeUnit) {
      ozQty = convertWithDensity(
        product.sizeQty * pack,
        product.sizeUnit,
        'oz',
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    }
    if (ozQty != null) {
      pricePerOz = product.priceNumber / ozQty;
    }
  } else if (unitType && unitType !== 'oz') {
    const conv = convertWithDensity(1, unitType, 'oz', {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
    if (!isNaN(conv) && conv > 0) {
      pricePerOz = pricePerOz / conv;
    }
  }
  if (pricePerOz != null) {
    const ozPerUnit = convertWithDensity(
      1,
      item.home_unit,
      'oz',
      { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
    );
    if (!isNaN(ozPerUnit) && ozPerUnit > 0) {
      return pricePerOz * ozPerUnit;
    }
  }
  return null;
}

async function ingredientCost(name, amountStr) {
  const prod = await loadFinalProduct(name);
  if (!prod) return null;
  const { pricePerUnit: ppu, unitType } = getPriceUnitInfo(prod);
  const pricePerUnit = pricePerHomeUnit(name, prod);
  if (pricePerUnit == null && !(unitType === 'fl oz' && ppu != null)) return null;
  const item = needsMap.get(canonicalName(name));
  if (!item) return null;
  const { value, unit } = parseQuantity(amountStr);
  if (!value) return null;
  let qty = value;
  if (unit && item.home_unit && unit.toLowerCase() !== item.home_unit.toLowerCase()) {
    const info = densityMap[name] || {};
    qty = convertWithDensity(value, unit, item.home_unit, {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
  }
  if (qty == null || isNaN(qty)) return null;
  if (unitType === 'fl oz' && ppu != null) {
    const fromUnit = item.home_unit || unit;
    const flozQty = convert(qty, fromUnit, 'fl oz');
    if (!isNaN(flozQty)) {
      return ppu * flozQty;
    }
  }
  return pricePerUnit * qty;
}

function createRows(meal, arr) {
  const rows = [];
  const ingredients = meal.ingredients || [];
  const ingCells = [];
  const spanCells = [];
  const canonicalMeal = canonicalName(meal.name || '');
  let imageTd;
  let nameTd;
  let weightTd;
  let editBtn;
  if (!Array.isArray(meal.users)) {
    const def = meal.people === undefined ? (meal.active === false ? 0 : 1) : meal.people;
    meal.users = userNames.map((_, i) => i < def);
  }
  if (meal.users.length < userNames.length) {
    for (let i = meal.users.length; i < userNames.length; i++) {
      meal.users.push(false);
    }
  }
  meal.people = meal.users.filter(Boolean).length;

  const mealCost = { total: 0 };
  const costPromises = [];
  let firstTotalTd = null;

  async function persistMealChange() {
    await saveMeals(arr);
    await calculateAndSaveMealNeeds();
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: 'inventory-updated' });
    }
  }

  ingredients.forEach((ing, idx) => {
    const tr = document.createElement('tr');
    if (idx === 0 && canonicalMeal) {
      tr.dataset.mealName = canonicalMeal;
    }
    if (idx === 0) {
      const useTd = document.createElement('td');
      useTd.classList.add('use-cell');
      const useContainer = document.createElement('div');
      useContainer.className = 'use-cell-content';
      useTd.appendChild(useContainer);
      const chks = [];
      userNames.forEach((u, i) => {
        const lbl = document.createElement('label');
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = meal.users[i];
        chk.addEventListener('change', async () => {
          meal.users[i] = chk.checked;
          meal.people = meal.users.filter(Boolean).length;
          meal.active = meal.people > 0;
          await persistMealChange();
        });
        chks.push(chk);
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(` ${u} `));
        const portionInput = document.createElement('input');
        portionInput.type = 'number';
        portionInput.step = '0.01';
        portionInput.className = 'portion-input';
        portionInput.value = String(
          (Array.isArray(meal.userPortionOverrides)
            ? meal.userPortionOverrides[i]
            : undefined) ?? defaultPortionFor(i)
        );
        portionInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            portionInput.blur();
          }
        });
        portionInput.addEventListener('blur', async () => {
          const base = defaultPortionFor(i);
          const current = Array.isArray(meal.userPortionOverrides)
            ? meal.userPortionOverrides
            : [];
          const previous = current.slice();
          const prevValue = previous[i];
          const raw = portionInput.value.trim();
          if (raw === '') {
            if (previous.length > i) {
              previous[i] = undefined;
            }
            const sanitized = sanitizeOverrides(previous, userNames.length);
            if (!overridesEqual(sanitized, current)) {
              meal.userPortionOverrides = sanitized;
              await persistMealChange();
            }
            portionInput.value = String(base);
            return;
          }
          const num = Number(raw);
          if (!Number.isFinite(num)) {
            const fallback = prevValue !== undefined ? prevValue : base;
            portionInput.value = String(fallback);
            return;
          }
          const newOverrides = previous.slice();
          if (sameMultiplier(num, base)) {
            if (newOverrides.length > i) newOverrides[i] = undefined;
          } else {
            newOverrides[i] = num;
          }
          const sanitized = sanitizeOverrides(newOverrides, userNames.length);
          if (!overridesEqual(sanitized, current)) {
            meal.userPortionOverrides = sanitized;
            await persistMealChange();
          }
          portionInput.value = String(sameMultiplier(num, base) ? base : num);
        });
        lbl.appendChild(portionInput);
        useContainer.appendChild(lbl);
      });
      if (ingredients.length > 1) useTd.rowSpan = ingredients.length;
      spanCells.push(useTd);

      const prepTd = document.createElement('td');
      const prepChk = document.createElement('input');
      prepChk.type = 'checkbox';
      prepChk.checked = meal.prepared || false;
      const prepAheadLabel = document.createElement('label');
      prepAheadLabel.style.marginLeft = '4px';
      const prepAheadChk = document.createElement('input');
      prepAheadChk.type = 'checkbox';
      prepAheadChk.checked = meal.prepAhead || false;
      prepAheadLabel.appendChild(prepAheadChk);
      prepAheadLabel.appendChild(document.createTextNode(' prep ahead'));
      function togglePrepAhead() {
        prepAheadLabel.style.display = prepChk.checked ? '' : 'none';
        if (!prepChk.checked) {
          prepAheadChk.checked = false;
          meal.prepAhead = false;
        }
      }
      togglePrepAhead();
      prepChk.addEventListener('change', async () => {
        meal.prepared = prepChk.checked;
        togglePrepAhead();
        await saveMeals(arr);
      });
      prepAheadChk.addEventListener('change', async () => {
        meal.prepAhead = prepAheadChk.checked;
        await saveMeals(arr);
      });
      prepTd.appendChild(prepChk);
      prepTd.appendChild(prepAheadLabel);
      if (ingredients.length > 1) prepTd.rowSpan = ingredients.length;
      spanCells.push(prepTd);

      const leftoverTd = document.createElement('td');
      const leftoverChk = document.createElement('input');
      leftoverChk.type = 'checkbox';
      leftoverChk.checked = meal.leftoverOk || false;
      leftoverChk.addEventListener('change', async () => {
        meal.leftoverOk = leftoverChk.checked;
        await saveMeals(arr);
      });
      leftoverTd.style.textAlign = 'center';
      leftoverTd.appendChild(leftoverChk);
      if (ingredients.length > 1) leftoverTd.rowSpan = ingredients.length;
      spanCells.push(leftoverTd);

      weightTd = document.createElement('td');
      weightTd.style.textAlign = 'center';
      weightTd.textContent = meal.weight ?? 1;
      if (ingredients.length > 1) weightTd.rowSpan = ingredients.length;
      spanCells.push(weightTd);

      const groupTd = document.createElement('td');
      const groupChk = document.createElement('input');
      groupChk.type = 'checkbox';
      groupChk.checked = meal.groupMeal || false;
      groupChk.addEventListener('change', async () => {
        meal.groupMeal = groupChk.checked;
        await saveMeals(arr);
      });
      groupTd.style.textAlign = 'center';
      groupTd.appendChild(groupChk);
      if (ingredients.length > 1) groupTd.rowSpan = ingredients.length;
      spanCells.push(groupTd);

      imageTd = document.createElement('td');
      const img = document.createElement('img');
      img.className = 'meal-img';
      img.style.display = 'none';
      imageTd.appendChild(img);
      if (ingredients.length > 1) imageTd.rowSpan = ingredients.length;
      spanCells.push(imageTd);

      nameTd = document.createElement('td');
      nameTd.style.minWidth = '200px';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = meal.name || '';
      nameTd.appendChild(nameSpan);
      if (ingredients.length > 1) nameTd.rowSpan = ingredients.length;
      spanCells.push(nameTd);

      setMealImage(img, meal);

      editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      const delBtn = document.createElement('button');
      delBtn.textContent = 'Delete';
      delBtn.style.display = deleteMode ? '' : 'none';
      deleteButtons.push(delBtn);
      delBtn.addEventListener('click', async () => {
        const idx = arr.indexOf(meal);
        if (idx !== -1) arr.splice(idx, 1);
        await saveMeals(arr);
        await calculateAndSaveMealNeeds();
        loadAndRender();
      });

      nameTd.appendChild(document.createElement('br'));
      nameTd.appendChild(editBtn);
      nameTd.appendChild(document.createTextNode(' '));
      nameTd.appendChild(delBtn);

      tr.appendChild(useTd);
      tr.appendChild(imageTd);
      tr.appendChild(nameTd);
      tr.appendChild(prepTd);
      tr.appendChild(leftoverTd);
      tr.appendChild(weightTd);
      tr.appendChild(groupTd);
    }

    const ingTd = document.createElement('td');
    ingTd.textContent = ing.name || '';
    if (ing.name) ingTd.dataset.name = ing.name;

    const prepItemTd = document.createElement('td');
    prepItemTd.style.textAlign = 'center';
    const prepItemChk = document.createElement('input');
    prepItemChk.type = 'checkbox';
    prepItemChk.checked = !!ing.prepAhead;
    prepItemChk.addEventListener('change', async () => {
      ing.prepAhead = prepItemChk.checked;
      await persistMealChange();
    });
    prepItemTd.appendChild(prepItemChk);

    const amtTd = document.createElement('td');
    amtTd.textContent = formatIngredientAmount(ing);

    ingCells.push({ ingTd, amtTd, prepTd: prepItemTd, tr });

    const costTd = document.createElement('td');
    let totalTd;
    if (idx === 0) {
      totalTd = document.createElement('td');
      if (ingredients.length > 1) totalTd.rowSpan = ingredients.length;
      spanCells.push(totalTd);
      firstTotalTd = totalTd;
    }

    const actionTd = document.createElement('td');
    if (ing.name) actionTd.dataset.name = ing.name;
    const key = ing.name ? canonicalName(ing.name) : '';
    if (ing.name && !inventorySet.has(key)) {
      ingTd.style.color = 'red';
      actionTd.appendChild(createAddButton(ing.name));
    }

    tr.appendChild(ingTd);
    tr.appendChild(prepItemTd);
    tr.appendChild(amtTd);
    tr.appendChild(costTd);
    if (totalTd) tr.appendChild(totalTd);
    tr.appendChild(actionTd);
    rows.push(tr);

    if (ing.name) {
      if (!ingredientCells[key]) ingredientCells[key] = [];
      ingredientCells[key].push({ ingTd, actionTd });
      const promise = ingredientCost(ing.name, ing.amount || ing.serving_size).then(c => {
        if (c != null) {
          costTd.textContent = `$${c.toFixed(2)}`;
          mealCost.total += c;
        }
      });
      costPromises.push(promise);
    }
  });

  Promise.all(costPromises).then(async () => {
    if (firstTotalTd && mealCost.total > 0) {
      const total = parseFloat(mealCost.total.toFixed(2));
      firstTotalTd.textContent = `$${total.toFixed(2)}`;
      if (meal.totalCost !== total) {
        meal.totalCost = total;
        await saveMeals(arr);
      }
    }
  });

  if (ingredients.length === 0) {
    const tr = document.createElement('tr');
    if (canonicalMeal) {
      tr.dataset.mealName = canonicalMeal;
    }
    const useTd = document.createElement('td');
    useTd.classList.add('use-cell');
    const useContainer = document.createElement('div');
    useContainer.className = 'use-cell-content';
    useTd.appendChild(useContainer);
    const chks = [];
    userNames.forEach((u, i) => {
      const lbl = document.createElement('label');
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = meal.users[i];
      chk.addEventListener('change', async () => {
        meal.users[i] = chk.checked;
        meal.people = meal.users.filter(Boolean).length;
        meal.active = meal.people > 0;
        await persistMealChange();
      });
      chks.push(chk);
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(` ${u} `));
      const portionInput = document.createElement('input');
      portionInput.type = 'number';
      portionInput.step = '0.01';
      portionInput.className = 'portion-input';
      portionInput.value = String(
        (Array.isArray(meal.userPortionOverrides)
          ? meal.userPortionOverrides[i]
          : undefined) ?? defaultPortionFor(i)
      );
      portionInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          portionInput.blur();
        }
      });
      portionInput.addEventListener('blur', async () => {
        const base = defaultPortionFor(i);
        const current = Array.isArray(meal.userPortionOverrides)
          ? meal.userPortionOverrides
          : [];
        const previous = current.slice();
        const prevValue = previous[i];
        const raw = portionInput.value.trim();
        if (raw === '') {
          if (previous.length > i) {
            previous[i] = undefined;
          }
          const sanitized = sanitizeOverrides(previous, userNames.length);
          if (!overridesEqual(sanitized, current)) {
            meal.userPortionOverrides = sanitized;
            await persistMealChange();
          }
          portionInput.value = String(base);
          return;
        }
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          const fallback = prevValue !== undefined ? prevValue : base;
          portionInput.value = String(fallback);
          return;
        }
        const newOverrides = previous.slice();
        if (sameMultiplier(num, base)) {
          if (newOverrides.length > i) newOverrides[i] = undefined;
        } else {
          newOverrides[i] = num;
        }
        const sanitized = sanitizeOverrides(newOverrides, userNames.length);
        if (!overridesEqual(sanitized, current)) {
          meal.userPortionOverrides = sanitized;
          await persistMealChange();
        }
        portionInput.value = String(sameMultiplier(num, base) ? base : num);
      });
      lbl.appendChild(portionInput);
      useContainer.appendChild(lbl);
    });
    imageTd = document.createElement('td');
    const img = document.createElement('img');
    img.className = 'meal-img';
    img.style.display = 'none';
    imageTd.appendChild(img);
    spanCells.push(useTd);
    spanCells.push(imageTd);

    nameTd = document.createElement('td');
    nameTd.style.minWidth = '200px';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = meal.name || '';
    nameTd.appendChild(nameSpan);
    setMealImage(img, meal);
    spanCells.push(nameTd);
    editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.style.display = deleteMode ? '' : 'none';
    deleteButtons.push(delBtn);
    delBtn.addEventListener('click', async () => {
      const idx = arr.indexOf(meal);
      if (idx !== -1) arr.splice(idx, 1);
      await saveMeals(arr);
      await calculateAndSaveMealNeeds();
      loadAndRender();
    });
    nameTd.appendChild(document.createElement('br'));
    nameTd.appendChild(editBtn);
    nameTd.appendChild(document.createTextNode(' '));
    nameTd.appendChild(delBtn);

    const prepTd = document.createElement('td');
    const prepChk = document.createElement('input');
    prepChk.type = 'checkbox';
    prepChk.checked = meal.prepared || false;
    const prepAheadLabel = document.createElement('label');
    prepAheadLabel.style.marginLeft = '4px';
    const prepAheadChk = document.createElement('input');
    prepAheadChk.type = 'checkbox';
    prepAheadChk.checked = meal.prepAhead || false;
    prepAheadLabel.appendChild(prepAheadChk);
    prepAheadLabel.appendChild(document.createTextNode(' prep ahead'));
    function togglePrepAhead2() {
      prepAheadLabel.style.display = prepChk.checked ? '' : 'none';
      if (!prepChk.checked) {
        prepAheadChk.checked = false;
        meal.prepAhead = false;
      }
    }
    togglePrepAhead2();
    prepChk.addEventListener('change', async () => {
      meal.prepared = prepChk.checked;
      togglePrepAhead2();
      await saveMeals(arr);
    });
    prepAheadChk.addEventListener('change', async () => {
      meal.prepAhead = prepAheadChk.checked;
      await saveMeals(arr);
    });
    prepTd.appendChild(prepChk);
    prepTd.appendChild(prepAheadLabel);
    spanCells.push(prepTd);

    const leftoverTd = document.createElement('td');
    const leftoverChk = document.createElement('input');
    leftoverChk.type = 'checkbox';
    leftoverChk.checked = meal.leftoverOk || false;
    leftoverChk.addEventListener('change', async () => {
      meal.leftoverOk = leftoverChk.checked;
      await saveMeals(arr);
    });
    leftoverTd.style.textAlign = 'center';
    leftoverTd.appendChild(leftoverChk);
    spanCells.push(leftoverTd);

    weightTd = document.createElement('td');
    weightTd.style.textAlign = 'center';
    weightTd.textContent = meal.weight ?? 1;
    spanCells.push(weightTd);

    const groupTd = document.createElement('td');
    const groupChk = document.createElement('input');
    groupChk.type = 'checkbox';
    groupChk.checked = meal.groupMeal || false;
    groupChk.addEventListener('change', async () => {
      meal.groupMeal = groupChk.checked;
      await saveMeals(arr);
    });
    groupTd.style.textAlign = 'center';
    groupTd.appendChild(groupChk);
    spanCells.push(groupTd);

    const ingTd = document.createElement('td');
    const prepItemTd = document.createElement('td');
    prepItemTd.style.textAlign = 'center';
    const amtTd = document.createElement('td');
    ingCells.push({ ingTd, amtTd, prepTd: prepItemTd, tr });
    const costTd = document.createElement('td');
    const totalTd = document.createElement('td');
    spanCells.push(totalTd);
    const actionTd = document.createElement('td');
    tr.appendChild(useTd);
    tr.appendChild(imageTd);
    tr.appendChild(nameTd);
    tr.appendChild(prepTd);
    tr.appendChild(leftoverTd);
    tr.appendChild(weightTd);
    tr.appendChild(groupTd);
    tr.appendChild(ingTd);
    tr.appendChild(prepItemTd);
    tr.appendChild(amtTd);
    tr.appendChild(costTd);
    tr.appendChild(totalTd);
    tr.appendChild(actionTd);
    rows.push(tr);
  }

  editBtn.addEventListener('click', () => {
    if (editBtn.classList.contains('editing')) {
      hideEdit();
    } else {
      showEdit();
    }
  });

  function showEdit() {
    editBtn.classList.add('editing');
    const rowsInfo = [];
    const addedRows = [];
    const baseSpan = Math.max(ingCells.length, 1);
    const spanElems = spanCells;
    let mealInput;
    let bookInput;
    let categorySelect;
    let mealLabel;
    let categoryLabel;
    let bookLabel;
    let saveBtn;
    let changeBtn;
    let fileInput;
    let newImage = null;
    let newIngBtn;
    let weightInput;

    function updateRowSpans() {
      const val = baseSpan + addedRows.length;
      spanElems.forEach(td => {
        if (!td) return;
        if (val > 1) td.rowSpan = val; else td.removeAttribute('rowspan');
      });
    }

    function checkSave() {
      const any =
        (mealInput && mealInput.value.trim()) ||
        (bookInput && bookInput.value.trim()) ||
        (categorySelect && categorySelect.value !== type) ||
        (weightInput && weightInput.value.trim()) ||
        rowsInfo.some(r => {
          if (r.nameInput.value.trim() || r.qtyInput.value.trim()) return true;
          if (r.prepInput && r.prepInput.checked !== r.initialPrep) return true;
          return false;
        }) ||
        newImage;
      if (saveBtn) saveBtn.style.display = any ? '' : 'none';
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }

    function addInputs(cell, ing = {}) {
      const { ingTd, amtTd, prepTd } = cell;
      const nameInput = document.createElement('textarea');
      nameInput.rows = 1;
      nameInput.style.display = 'block';
      nameInput.style.marginTop = '2px';
      nameInput.style.width = '98%';
      nameInput.style.overflow = 'hidden';
      nameInput.value = ing.name || '';
      ingTd.innerHTML = '';
      ingTd.appendChild(nameInput);

      const qtyInput = document.createElement('input');
      qtyInput.type = 'text';
      qtyInput.style.width = '40px';
      qtyInput.style.marginRight = '2px';
      const select = document.createElement('select');
      units.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        select.appendChild(opt);
      });
      const { value, unit } = parseQuantity(ing.amount || ing.serving_size);
      if (value) qtyInput.value = value;
      if (unit) select.value = unit;
      amtTd.innerHTML = '';
      amtTd.appendChild(qtyInput);
      amtTd.appendChild(select);

      const prepChk = document.createElement('input');
      prepChk.type = 'checkbox';
      prepChk.checked = !!ing.prepAhead;
      prepTd.innerHTML = '';
      prepTd.style.textAlign = 'center';
      prepTd.appendChild(prepChk);

      autoResize(nameInput);

      nameInput.addEventListener('input', () => {
        autoResize(nameInput);
        checkSave();
      });
      qtyInput.addEventListener('input', checkSave);
      select.addEventListener('change', checkSave);
      prepChk.addEventListener('change', checkSave);
      [nameInput, qtyInput, select].forEach(el =>
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        })
      );

      rowsInfo.push({
        nameInput,
        qtyInput,
        select,
        prepInput: prepChk,
        initialPrep: !!ing.prepAhead,
        prepCell: prepTd
      });
    }

    mealInput = document.createElement('input');
    mealInput.style.display = 'block';
    mealInput.style.marginTop = '2px';
    mealInput.style.width = '95%';
    saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.display = 'none';
    saveBtn.style.marginTop = '2px';
    changeBtn = document.createElement('button');
    changeBtn.textContent = 'Change';
    changeBtn.style.display = 'block';
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    changeBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        newImage = reader.result;
        setMealImage(imageTd.querySelector('img.meal-img'), { ...meal, image: newImage });
        checkSave();
      };
      reader.readAsDataURL(file);
    });

    newIngBtn = document.createElement('button');
    newIngBtn.textContent = 'New Ingredient';
    newIngBtn.style.display = 'block';
    newIngBtn.style.marginTop = '2px';
    newIngBtn.addEventListener('click', () => {
      const tr = document.createElement('tr');
      const ingTd = document.createElement('td');
      const prepTd = document.createElement('td');
      prepTd.style.textAlign = 'center';
      const amtTd = document.createElement('td');
      const costTd = document.createElement('td');
      const actionTd = document.createElement('td');
      tr.appendChild(ingTd);
      tr.appendChild(prepTd);
      tr.appendChild(amtTd);
      tr.appendChild(costTd);
      tr.appendChild(actionTd);
      rows[rows.length - 1].after(tr);
      rows.push(tr);
      const cell = { ingTd, amtTd, prepTd, tr };
      ingCells.push(cell);
      addedRows.push(tr);
      addInputs(cell, { prepAhead: meal.prepared && meal.prepAhead });
      updateRowSpans();
    });

    weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.min = '0.1';
    weightInput.step = '0.1';
    weightInput.style.width = '40px';
    weightInput.style.marginTop = '2px';
    weightInput.style.display = 'block';
    weightInput.value = meal.weight ?? 1;
    weightInput.addEventListener('input', checkSave);

    bookInput = document.createElement('input');
    bookInput.style.display = 'block';
    bookInput.style.marginTop = '2px';
    bookInput.style.width = '95%';
    bookInput.value = meal.recipeBook || '';

    categorySelect = document.createElement('select');
    Object.keys(MEAL_TYPES).forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = MEAL_TYPES[cat].label;
      categorySelect.appendChild(opt);
    });
    categorySelect.value = type;
    categorySelect.style.display = 'block';
    categorySelect.style.marginTop = '2px';
    categorySelect.style.width = '95%';
    categorySelect.addEventListener('change', checkSave);

    mealLabel = document.createElement('label');
    mealLabel.textContent = 'Meal Name:';
    mealLabel.style.display = 'block';
    mealLabel.style.marginTop = '2px';
    mealLabel.appendChild(mealInput);

    categoryLabel = document.createElement('label');
    categoryLabel.textContent = 'Meal Category:';
    categoryLabel.style.display = 'block';
    categoryLabel.style.marginTop = '2px';
    categoryLabel.appendChild(categorySelect);

    bookLabel = document.createElement('label');
    bookLabel.textContent = 'Recipe Book:';
    bookLabel.style.display = 'block';
    bookLabel.style.marginTop = '2px';
    bookLabel.appendChild(bookInput);

    imageTd.appendChild(changeBtn);
    imageTd.appendChild(fileInput);
    nameTd.appendChild(mealLabel);
    nameTd.appendChild(categoryLabel);
    nameTd.appendChild(bookLabel);
    nameTd.appendChild(newIngBtn);
    weightTd.appendChild(weightInput);
    nameTd.appendChild(saveBtn);
    mealInput.addEventListener('input', checkSave);
    bookInput.addEventListener('input', checkSave);
    bookInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
    });
    mealInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
    });
    saveBtn.addEventListener('click', commit);

    ingCells.forEach((cell, idx) => addInputs(cell, ingredients[idx]));
    updateRowSpans();

    async function commit() {
      const nameVal = mealInput ? mealInput.value.trim() : '';
      const bookVal = bookInput ? bookInput.value.trim() : '';
      const catVal = categorySelect ? categorySelect.value : type;
      let changed = false;
      if (nameVal) {
        meal.name = nameVal;
        changed = true;
      }
      if (bookInput && bookVal !== meal.recipeBook) {
        meal.recipeBook = bookVal;
        changed = true;
      }
      if (categorySelect && catVal !== type) {
        const idx = arr.indexOf(meal);
        if (idx !== -1) arr.splice(idx, 1);
        const destArr = await loadMealsForType(catVal);
        destArr.push(meal);
        await saveMealsForType(catVal, destArr);
        changed = true;
      }
      if (weightInput) {
        const w = parseFloat(weightInput.value);
        const wt = !isNaN(w) && w > 0 ? w : 1;
        if (wt !== meal.weight) {
          meal.weight = wt;
          changed = true;
        }
      }
      const newIngs = [];
      rowsInfo.forEach(r => {
        const n = r.nameInput.value.trim();
        const q = r.qtyInput.value.trim();
        const u = r.select.value;
        if (!n && !q) return;
        const amt = q ? `${q} ${u}` : '';
        newIngs.push({
          name: n,
          amount: amt,
          serving_size: amt,
          prepAhead: !!(r.prepInput && r.prepInput.checked)
        });
      });
      if (JSON.stringify(newIngs) !== JSON.stringify(meal.ingredients)) {
        meal.ingredients = newIngs;
        changed = true;
      }
      if (newImage) {
        meal.image = newImage;
        changed = true;
      }
      if (changed) {
        await saveMeals(arr);
        await calculateAndSaveMealNeeds();
      }
      hideEdit();
      if (changed) loadAndRender();
    }

    function hideEdit() {
      rowsInfo.forEach(r => {
        r.nameInput.remove();
        r.qtyInput.remove();
        r.select.remove();
        if (r.prepInput) {
          const parent = r.prepInput.parentElement;
          if (parent) parent.remove();
          else r.prepInput.remove();
        }
        if (r.prepCell) r.prepCell.innerHTML = '';
      });
      rowsInfo.length = 0;
      addedRows.forEach(tr => tr.remove());
      addedRows.length = 0;
      ingCells.forEach((cell, idx) => {
        const ing = meal.ingredients[idx];
        cell.ingTd.textContent = ing?.name || '';
        if (ing?.name) {
          cell.ingTd.dataset.name = ing.name;
        } else {
          delete cell.ingTd.dataset.name;
        }
        cell.amtTd.textContent = formatIngredientAmount(ing);
        if (cell.prepTd) {
          cell.prepTd.innerHTML = '';
          cell.prepTd.style.textAlign = 'center';
          if (ing && typeof ing === 'object') {
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = !!ing.prepAhead;
            chk.addEventListener('change', async () => {
              ing.prepAhead = chk.checked;
              await persistMealChange();
            });
            cell.prepTd.appendChild(chk);
          }
        }
      });
      updateRowSpans();
      if (mealLabel) mealLabel.remove();
      if (categoryLabel) categoryLabel.remove();
      if (bookLabel) bookLabel.remove();
      if (newIngBtn) newIngBtn.remove();
      if (saveBtn) saveBtn.remove();
      if (changeBtn) changeBtn.remove();
      if (fileInput) fileInput.remove();
      if (weightInput) weightInput.remove();
      newImage = null;
      setMealImage(imageTd.querySelector('img.meal-img'), meal);
      editBtn.classList.remove('editing');
    }

    showEdit.hideEdit = hideEdit;
  }

  function hideEdit() {
    if (typeof showEdit.hideEdit === 'function') showEdit.hideEdit();
  }

  return rows;
}

function updateInventoryDisplay() {
  Object.entries(ingredientCells).forEach(([name, cells]) => {
    const inStock = inventorySet.has(name);
    cells.forEach(({ ingTd, actionTd }) => {
      ingTd.style.color = inStock ? '' : 'red';
      if (inStock) {
        actionTd.innerHTML = '';
      } else if (!actionTd.querySelector('button')) {
        actionTd.appendChild(createAddButton(name));
      }
    });
  });
}

async function loadAndRender() {
  const scrollTop = window.scrollY;
  const tbody = document.getElementById('mealBody');
  tbody.innerHTML = '';
  deleteButtons.length = 0;
  Object.keys(ingredientCells).forEach(k => delete ingredientCells[k]);
  const [meals, stock, users, portionMultipliers] = await Promise.all([
    loadMeals(),
    loadStock(),
    loadUsers(),
    loadUserPortionMultipliers()
  ]);
  userNames = users;
  userPortionDefaults = users.map((_, idx) => {
    const val = portionMultipliers[idx];
    return typeof val === 'number' && Number.isFinite(val) ? val : 1;
  });
  let overridesChanged = false;
  meals.forEach(meal => {
    if (normalizeMealOverrides(meal)) overridesChanged = true;
  });
  if (overridesChanged) {
    await saveMeals(meals);
  }
  inventorySet = new Set(stock.map(s => canonicalName(s.name)));
  const bookMap = {};
  meals.forEach(m => {
    const book = m.recipeBook || '';
    if (!bookMap[book]) bookMap[book] = [];
    bookMap[book].push(m);
  });
  const headerColspan = 12;
  const bookNames = Object.keys(bookMap).sort((a, b) => a.localeCompare(b));
  const validBooks = new Set(bookNames);
  if (focusBook !== null && validBooks.has(focusBook)) {
    expandedBooks.set(focusBook, true);
  }
  expandedBooks.forEach((_, book) => {
    if (!validBooks.has(book)) {
      expandedBooks.delete(book);
    }
  });
  bookNames.forEach(book => {
    const headerTr = document.createElement('tr');
    const th = document.createElement('th');
    th.className = 'book-header';
    th.colSpan = headerColspan;
    th.textContent = book || 'Uncategorized';
    headerTr.appendChild(th);
    tbody.appendChild(headerTr);
    const rows = [];
    let expanded = expandedBooks.get(book);
    if (expanded === undefined) expanded = false;
    bookMap[book].forEach(meal => {
      const r = createRows(meal, meals);
      r.forEach(row => {
        row.dataset.book = book;
        row.style.display = expanded ? '' : 'none';
        rows.push(row);
        tbody.appendChild(row);
      });
    });
    th.addEventListener('click', () => {
      expanded = !expanded;
      rows.forEach(r => (r.style.display = expanded ? '' : 'none'));
      if (rows.length > 0) {
        expandedBooks.set(book, expanded);
      } else {
        expandedBooks.delete(book);
      }
    });
  });
  updateInventoryDisplay();
  await calculateAndSaveMealNeeds();
  if (!focusHandled) {
    let targetRow = null;
    if (focusMealName) {
      const candidates = tbody.querySelectorAll('[data-meal-name]');
      targetRow = Array.from(candidates).find(
        row => row.dataset.mealName === focusMealName
      );
    }
    if (focusMealName && targetRow) {
      focusHandled = true;
      const rect = targetRow.getBoundingClientRect();
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 0;
      const offset = rect.top + window.scrollY - Math.max((viewportHeight - rect.height) / 2, 0);
      const clampedOffset = offset < 0 ? 0 : offset;
      window.scrollTo({ top: clampedOffset });
      targetRow.classList.add('focused-meal');
      setTimeout(() => {
        if (targetRow.isConnected) {
          targetRow.classList.remove('focused-meal');
        }
      }, 2000);
      return;
    }
    focusHandled = true;
  }
  window.scrollTo(0, scrollTop);
}

async function init() {
  await initializeMealCategories();
  await initUomTable();
  const [needs, dMap, u] = await Promise.all([
    loadNeeds(),
    loadDensityMap(),
    loadUnits()
  ]);
  needsMap = new Map(needs.map(n => [canonicalName(n.name), n]));
  densityMap = dMap;
  units = u;
  const info = MEAL_TYPES[type] || MEAL_TYPES.breakfast;
  key = info.key;
  path = info.path;
  label = info.label;
  document.getElementById('title').textContent = `${label} Meals`;
  visibilityCheckbox = document.getElementById('displayOnWhatToCook');
  if (visibilityCheckbox) {
    try {
      whatToCookVisibility = await loadWhatToCookVisibility();
    } catch (err) {
      console.error('Failed to load What To Cook visibility settings', err);
      whatToCookVisibility = {};
    }
    setVisibilityCheckboxState(whatToCookVisibility[type] !== false);
    visibilityCheckbox.addEventListener('change', async () => {
      if (suppressVisibilityChange) return;
      const checked = visibilityCheckbox.checked;
      const nextMap = { ...whatToCookVisibility, [type]: checked };
      whatToCookVisibility = nextMap;
      try {
        await saveWhatToCookVisibility(nextMap);
      } catch (err) {
        console.error('Failed to save What To Cook visibility settings', err);
      }
    });
  }
  const addBtn = document.getElementById('addMeal');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openOrFocusWindow(`addMeal.html?type=${type}`);
    });
  }
  const removeBtn = document.getElementById('removeMeal');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      deleteMode = !deleteMode;
      removeBtn.textContent = deleteMode ? 'Done' : 'Remove Meal';
      deleteButtons.forEach(btn => {
        btn.style.display = deleteMode ? '' : 'none';
      });
    });
  }
  const repairBtn = document.getElementById('repairMealIds');
  if (repairBtn) {
    repairBtn.addEventListener('click', async () => {
      const originalText = repairBtn.textContent;
      repairBtn.disabled = true;
      repairBtn.textContent = 'Correcting…';
      try {
        const { mealsUpdated, mapUpdates } = await correctMealIdErrors();
        if (mealsUpdated === 0 && mapUpdates === 0) {
          alert('No meal id errors were found.');
        } else {
          const parts = [];
          if (mealsUpdated > 0) {
            parts.push(`${mealsUpdated} meal id${mealsUpdated === 1 ? '' : 's'} updated`);
          }
          if (mapUpdates > 0) {
            parts.push(`${mapUpdates} name mapping${mapUpdates === 1 ? '' : 's'} adjusted`);
          }
          alert(`Corrected ${parts.join(' and ')}.`);
          try {
            await loadAndRender();
          } catch (refreshErr) {
            console.error('Failed to refresh meal list after id repair', refreshErr);
          }
        }
      } catch (err) {
        console.error('Failed to repair meal ids', err);
        alert('Failed to correct meal id errors. Please try again.');
      } finally {
        repairBtn.disabled = false;
        repairBtn.textContent = originalText;
      }
    });
  }
  await loadAndRender();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.currentStock) {
      const newStock = changes.currentStock.newValue || [];
      inventorySet = new Set(newStock.map(s => canonicalName(s.name)));
      updateInventoryDisplay();
    }
    if (area === 'local' && changes.users) {
      loadAndRender();
    }
    if (area === 'local' && changes[key]) {
      loadAndRender();
    }
    if (area === 'local' && changes[WHAT_TO_COOK_VISIBILITY_KEY]) {
      loadWhatToCookVisibility()
        .then(map => {
          whatToCookVisibility = map;
          if (visibilityCheckbox) {
            setVisibilityCheckboxState(map[type] !== false);
          }
        })
        .catch(err => {
          console.error('Failed to refresh What To Cook visibility state', err);
        });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

import {
  MEAL_TYPES,
  initializeMealCategories,
  loadMealsDict,
  saveMealsDict,
  loadRecipeBooks,
  saveRecipeBooks
} from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { loadUsers } from './utils/userData.js';
import { canonicalName } from './utils/nameUtils.js';
import { parseQuantity } from './utils/calendarUtils.js';
import { initUomTable, convert } from './utils/uomConverter.js';
import { loadDensityMap, convertWithDensity } from './utils/unitNormalize.js';
import { getPriceUnitInfo, sheetSqFtFor } from './utils/priceUtils.js';
import { getItemName } from './utils/items.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';
const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

const params = new URLSearchParams(location.search);
let type = params.get('type') || 'breakfast';
let key, path, label;

let inventorySet = new Set();
const ingredientCells = {};
let userNames = [];
let deleteMode = false;
const deleteButtons = [];
let needsMap = new Map();
let densityMap = {};
const UOM_PATH = 'Required for grocery app/uom_conversion_table.json';
let units = [];
let mealsDict = {};
let recipeBooks = {};

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

function loadMeals() {
  return new Promise(async resolve => {
    chrome.storage.local.get([key, 'meals', 'recipeBooks', 'items'], async data => {
      mealsDict = data.meals || {};
      Object.entries(mealsDict).forEach(([id, val]) => {
        if (typeof val === 'string') {
          mealsDict[id] = { name: val };
        }
      });
      recipeBooks = data.recipeBooks || {};
      const itemsMap = data.items || {};
      Object.entries(itemsMap).forEach(([id, val]) => {
        if (typeof val === 'string') {
          itemsMap[id] = { name: val };
        }
      });
      let arr = data[key];
      if (!arr) arr = await loadJSON(path);
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (Array.isArray(m.ingredients)) {
            m.ingredients.forEach(ing => {
              const id = String(ing.name);
              ing.itemId = id;
              ing.name = getItemName(itemsMap, id);
            });
          }
          if (m.prepared === undefined) m.prepared = false;
          if (m.prepAhead === undefined) m.prepAhead = false;
          if (m.recipeBook === undefined) m.recipeBook = '';
        });
      }
      resolve(arr || []);
    });
  });
}

function loadStock() {
  return new Promise(async resolve => {
    chrome.storage.local.get('currentStock', async data => {
      if (data.currentStock) {
        resolve(data.currentStock);
      } else {
        const stock = await loadJSON(STOCK_PATH);
        resolve(stock);
      }
    });
  });
}

function loadNeeds() {
  return new Promise(async resolve => {
    chrome.storage.local.get('yearlyNeeds', async data => {
      if (data.yearlyNeeds) {
        resolve(data.yearlyNeeds);
      } else {
        const arr = await loadJSON(NEEDS_PATH);
        resolve(arr);
      }
    });
  });
}

async function loadUnits() {
  const data = await loadJSON(UOM_PATH);
  return Object.keys(data);
}

function saveMeals(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: arr }, () => resolve());
  });
}

function loadMealsForType(cat) {
  const info = MEAL_TYPES[cat];
  if (!info) return Promise.resolve([]);
  return new Promise(async resolve => {
    chrome.storage.local.get([info.key, 'meals', 'recipeBooks', 'items'], async data => {
      mealsDict = data.meals || mealsDict;
      Object.entries(mealsDict).forEach(([id, val]) => {
        if (typeof val === 'string') {
          mealsDict[id] = { name: val };
        }
      });
      recipeBooks = data.recipeBooks || recipeBooks;
      const itemsMap = data.items || {};
      Object.entries(itemsMap).forEach(([id, val]) => {
        if (typeof val === 'string') {
          itemsMap[id] = { name: val };
        }
      });
      let arr = data[info.key];
      if (!arr) arr = await loadJSON(info.path);
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (Array.isArray(m.ingredients)) {
            m.ingredients.forEach(ing => {
              const id = String(ing.name);
              ing.itemId = id;
              ing.name = getItemName(itemsMap, id);
            });
          }
          if (m.prepared === undefined) m.prepared = false;
          if (m.prepAhead === undefined) m.prepAhead = false;
          if (m.recipeBook === undefined) m.recipeBook = '';
        });
      }
      resolve(arr || []);
    });
  });
}

function saveMealsForType(cat, arr) {
  const info = MEAL_TYPES[cat];
  if (!info) return Promise.resolve();
  return new Promise(resolve => {
    chrome.storage.local.set({ [info.key]: arr }, () => resolve());
  });
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

  ingredients.forEach((ing, idx) => {
    const tr = document.createElement('tr');
    if (idx === 0) {
      const useTd = document.createElement('td');
      useTd.style.whiteSpace = 'nowrap';
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
          await saveMeals(arr);
          await calculateAndSaveMealNeeds();
        });
        chks.push(chk);
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(` ${u} `));
        useTd.appendChild(lbl);
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
      nameSpan.textContent = mealsDict[meal.name]?.name || meal.name || '';
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
      tr.appendChild(weightTd);
      tr.appendChild(groupTd);
    }

    const ingTd = document.createElement('td');
    ingTd.textContent = ing.name || '';
    if (ing.name) ingTd.dataset.name = ing.name;

    const amtTd = document.createElement('td');
    amtTd.textContent = ing.amount || ing.serving_size || '';

    ingCells.push({ ingTd, amtTd, tr });

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
    const useTd = document.createElement('td');
    useTd.style.whiteSpace = 'nowrap';
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
        await saveMeals(arr);
        await calculateAndSaveMealNeeds();
      });
      chks.push(chk);
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(` ${u} `));
      useTd.appendChild(lbl);
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
    nameSpan.textContent = mealsDict[meal.name]?.name || meal.name || '';
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
    const amtTd = document.createElement('td');
    ingCells.push({ ingTd, amtTd, tr });
    const costTd = document.createElement('td');
    const totalTd = document.createElement('td');
    spanCells.push(totalTd);
    const actionTd = document.createElement('td');
    tr.appendChild(useTd);
    tr.appendChild(imageTd);
    tr.appendChild(nameTd);
    tr.appendChild(prepTd);
    tr.appendChild(weightTd);
    tr.appendChild(groupTd);
    tr.appendChild(ingTd);
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
        rowsInfo.some(r => r.nameInput.value.trim() || r.qtyInput.value.trim()) ||
        newImage;
      if (saveBtn) saveBtn.style.display = any ? '' : 'none';
    }

    function addInputs(cell, ing = {}) {
      const { ingTd, amtTd } = cell;
      const nameInput = document.createElement('input');
      nameInput.style.display = 'block';
      nameInput.style.marginTop = '2px';
      nameInput.style.width = '95%';
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

      nameInput.addEventListener('input', checkSave);
      qtyInput.addEventListener('input', checkSave);
      select.addEventListener('change', checkSave);
      [nameInput, qtyInput, select].forEach(el =>
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter') commit();
        })
      );

      rowsInfo.push({ nameInput, qtyInput, select });
    }

    mealInput = document.createElement('input');
    mealInput.style.display = 'block';
    mealInput.style.marginTop = '2px';
    mealInput.style.width = '95%';
    mealInput.value = mealsDict[meal.name]?.name || meal.name || '';
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
      const amtTd = document.createElement('td');
      const costTd = document.createElement('td');
      const actionTd = document.createElement('td');
      tr.appendChild(ingTd);
      tr.appendChild(amtTd);
      tr.appendChild(costTd);
      tr.appendChild(actionTd);
      rows[rows.length - 1].after(tr);
      rows.push(tr);
      const cell = { ingTd, amtTd, tr };
      ingCells.push(cell);
      addedRows.push(tr);
      addInputs(cell, {});
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
    bookInput.value = recipeBooks[meal.recipeBook] || '';

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
      if (nameVal && nameVal !== (mealsDict[meal.name]?.name || meal.name)) {
        mealsDict[meal.name] = mealsDict[meal.name] || {};
        mealsDict[meal.name].name = nameVal;
        changed = true;
      }
      if (bookInput && bookVal !== (recipeBooks[meal.recipeBook] || '')) {
        let bookId = '';
        if (bookVal) {
          bookId = canonicalName(bookVal).replace(/\s+/g, '_');
          recipeBooks[bookId] = bookVal;
        }
        meal.recipeBook = bookId;
        mealsDict[meal.name] = mealsDict[meal.name] || {};
        mealsDict[meal.name].recipeBook = bookId;
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
        newIngs.push({ name: n, amount: amt, serving_size: amt });
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
        await saveMealsDict(mealsDict);
        await saveRecipeBooks(recipeBooks);
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
      });
      rowsInfo.length = 0;
      addedRows.forEach(tr => tr.remove());
      addedRows.length = 0;
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
  const [meals, stock, users] = await Promise.all([
    loadMeals(),
    loadStock(),
    loadUsers()
  ]);
  userNames = users;
  inventorySet = new Set(stock.map(s => canonicalName(s.name)));
  const bookMap = {};
  meals.forEach(m => {
    const book = recipeBooks[m.recipeBook] || '';
    if (!bookMap[book]) bookMap[book] = [];
    bookMap[book].push(m);
  });
  const headerColspan = 11;
  Object.keys(bookMap)
    .sort((a, b) => a.localeCompare(b))
    .forEach(book => {
      const headerTr = document.createElement('tr');
      const th = document.createElement('th');
      th.className = 'book-header';
      th.colSpan = headerColspan;
      th.textContent = book || 'Uncategorized';
      headerTr.appendChild(th);
      tbody.appendChild(headerTr);
      const rows = [];
      bookMap[book].forEach(meal => {
        const r = createRows(meal, meals);
        r.forEach(row => {
          row.dataset.book = book;
          row.style.display = 'none';
          rows.push(row);
          tbody.appendChild(row);
        });
      });
      th.addEventListener('click', () => {
        const hidden = rows[0] && rows[0].style.display === 'none';
        rows.forEach(r => (r.style.display = hidden ? '' : 'none'));
      });
    });
  updateInventoryDisplay();
  await calculateAndSaveMealNeeds();
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
  });
}

document.addEventListener('DOMContentLoaded', init);

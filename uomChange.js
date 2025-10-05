import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory } from './utils/sortByCategory.js';
import { convert } from './utils/uomConverter.js';
import { loadArray as loadItemArray, convertArrayToNames } from './utils/itemStorage.js';
import { initializeMealCategories, MEAL_TYPES } from './utils/mealData.js';
import { canonicalName } from './utils/nameUtils.js';
import { openOrFocusWindow } from './utils/windowUtils.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const CONSUMPTION_PATH = 'Required for grocery app/monthly_consumption_table.json';
const STOCK_PATH = 'Required for grocery app/current_stock_table.json';

let filterText = '';
const headerState = {};
let allNeeds = [];
let tbody;
let itemUsageMap = new Map();

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

let needs = [];
let consumption = [];
let stock = [];
let rows = [];

async function buildItemUsageMap() {
  const usage = new Map();
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
        });
      });
    })
  );
  itemUsageMap = usage;
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

function buildRow(item) {
  const tr = document.createElement('tr');
  const nameTd = document.createElement('td');
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'item-name-toggle';
  toggleBtn.textContent = item.name;
  toggleBtn.setAttribute('aria-expanded', 'false');
  nameTd.appendChild(toggleBtn);
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
    toggleBtn
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
}

document.addEventListener('DOMContentLoaded', init);

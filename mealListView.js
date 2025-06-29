import { MEAL_TYPES } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { loadUsers } from './utils/userData.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';

const params = new URLSearchParams(location.search);
const type = params.get('type') || 'breakfast';
const { key, path, label } = MEAL_TYPES[type] || MEAL_TYPES.breakfast;

let inventorySet = new Set();
const ingredientCells = {};
let userNames = [];

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
    chrome.storage.local.get(key, async data => {
      if (data[key]) {
        resolve(data[key]);
      } else {
        const arr = await loadJSON(path);
        resolve(arr);
      }
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

function saveMeals(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: arr }, () => resolve());
  });
}

function createRows(meal, arr) {
  const rows = [];
  const ingredients = meal.ingredients || [];
  const ingTds = [];
  let nameTd;
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

      nameTd = document.createElement('td');
      nameTd.textContent = meal.name || '';
      if (ingredients.length > 1) nameTd.rowSpan = ingredients.length;

      editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      nameTd.appendChild(document.createElement('br'));
      nameTd.appendChild(editBtn);

      tr.appendChild(useTd);
      tr.appendChild(nameTd);
    }

    const ingTd = document.createElement('td');
    ingTd.textContent = ing.name || '';
    if (ing.name) ingTd.dataset.name = ing.name;
    ingTds.push(ingTd);

    const amtTd = document.createElement('td');
    amtTd.textContent = ing.amount || ing.serving_size || '';

    const actionTd = document.createElement('td');
    if (ing.name) actionTd.dataset.name = ing.name;
    if (ing.name && !inventorySet.has(ing.name)) {
      ingTd.style.color = 'red';
      actionTd.appendChild(createAddButton(ing.name));
    }

    tr.appendChild(ingTd);
    tr.appendChild(amtTd);
    tr.appendChild(actionTd);
    rows.push(tr);

    if (ing.name) {
      if (!ingredientCells[ing.name]) ingredientCells[ing.name] = [];
      ingredientCells[ing.name].push({ ingTd, actionTd });
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
    nameTd = document.createElement('td');
    nameTd.textContent = meal.name || '';
    editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    nameTd.appendChild(document.createElement('br'));
    nameTd.appendChild(editBtn);

    const ingTd = document.createElement('td');
    ingTds.push(ingTd);
    const amtTd = document.createElement('td');
    const actionTd = document.createElement('td');
    tr.appendChild(useTd);
    tr.appendChild(nameTd);
    tr.appendChild(ingTd);
    tr.appendChild(amtTd);
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
    const ingredientInputs = [];
    let mealInput;
    let saveBtn;

    function checkSave() {
      const any =
        (mealInput && mealInput.value.trim()) ||
        ingredientInputs.some(i => i.value.trim());
      if (saveBtn) saveBtn.style.display = any ? '' : 'none';
    }

    mealInput = document.createElement('input');
    mealInput.style.display = 'block';
    mealInput.style.marginTop = '2px';
    mealInput.style.width = '95%';
    saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.display = 'none';
    saveBtn.style.marginTop = '2px';
    nameTd.appendChild(mealInput);
    nameTd.appendChild(saveBtn);
    mealInput.addEventListener('input', checkSave);
    mealInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
    });
    saveBtn.addEventListener('click', commit);

    ingTds.forEach(td => {
      const input = document.createElement('input');
      input.style.display = 'block';
      input.style.marginTop = '2px';
      input.style.width = '95%';
      td.appendChild(input);
      input.addEventListener('input', checkSave);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') commit();
      });
      ingredientInputs.push(input);
    });

    async function commit() {
      const nameVal = mealInput ? mealInput.value.trim() : '';
      const ingVals = ingredientInputs.map(i => i.value.trim());
      let changed = false;
      if (nameVal) {
        meal.name = nameVal;
        changed = true;
      }
      ingVals.forEach((val, idx) => {
        if (val) {
          if (meal.ingredients[idx]) meal.ingredients[idx].name = val;
          changed = true;
        }
      });
      if (changed) {
        await saveMeals(arr);
        await calculateAndSaveMealNeeds();
      }
      hideEdit();
      if (changed) location.reload();
    }

    function hideEdit() {
      ingredientInputs.forEach(i => i.remove());
      ingredientInputs.length = 0;
      if (mealInput) mealInput.remove();
      if (saveBtn) saveBtn.remove();
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

async function init() {
  document.getElementById('title').textContent = `${label} Meals`;
  const addBtn = document.getElementById('addMeal');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openOrFocusWindow(`addMeal.html?type=${type}`);
    });
  }
  const tbody = document.getElementById('mealBody');
  const [meals, stock, users] = await Promise.all([
    loadMeals(),
    loadStock(),
    loadUsers()
  ]);
  userNames = users;
  inventorySet = new Set(stock.map(s => s.name));
  meals.forEach(meal => {
    const rows = createRows(meal, meals);
    rows.forEach(row => tbody.appendChild(row));
  });
  updateInventoryDisplay();
  await calculateAndSaveMealNeeds();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.currentStock) {
      const newStock = changes.currentStock.newValue || [];
      inventorySet = new Set(newStock.map(s => s.name));
      updateInventoryDisplay();
    }
    if (area === 'local' && changes.users) {
      location.reload();
    }
    if (area === 'local' && changes[key]) {
      location.reload();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

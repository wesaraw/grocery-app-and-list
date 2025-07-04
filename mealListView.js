import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { loadUsers } from './utils/userData.js';
import { canonicalName } from './utils/nameUtils.js';

const STOCK_PATH = 'Required for grocery app/current_stock_table.json';

const params = new URLSearchParams(location.search);
let type = params.get('type') || 'breakfast';
let key, path, label;

let inventorySet = new Set();
const ingredientCells = {};
let userNames = [];
let deleteMode = false;
const deleteButtons = [];

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
    chrome.storage.local.get(key, async data => {
      let arr = data[key];
      if (!arr) arr = await loadJSON(path);
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (m.prepared === undefined) m.prepared = false;
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

function saveMeals(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: arr }, () => resolve());
  });
}

function createRows(meal, arr) {
  const rows = [];
  const ingredients = meal.ingredients || [];
  const ingTds = [];
  let imageTd;
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

      const prepTd = document.createElement('td');
      const prepChk = document.createElement('input');
      prepChk.type = 'checkbox';
      prepChk.checked = meal.prepared || false;
      prepChk.addEventListener('change', async () => {
        meal.prepared = prepChk.checked;
        await saveMeals(arr);
      });
      prepTd.appendChild(prepChk);
      if (ingredients.length > 1) prepTd.rowSpan = ingredients.length;

      imageTd = document.createElement('td');
      const img = document.createElement('img');
      img.className = 'meal-img';
      img.style.display = 'none';
      imageTd.appendChild(img);
      if (ingredients.length > 1) imageTd.rowSpan = ingredients.length;

      nameTd = document.createElement('td');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = meal.name || '';
      nameTd.appendChild(nameSpan);
      if (ingredients.length > 1) nameTd.rowSpan = ingredients.length;

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
    }

    const ingTd = document.createElement('td');
    ingTd.textContent = ing.name || '';
    if (ing.name) ingTd.dataset.name = ing.name;
    ingTds.push(ingTd);

    const amtTd = document.createElement('td');
    amtTd.textContent = ing.amount || ing.serving_size || '';

    const actionTd = document.createElement('td');
    if (ing.name) actionTd.dataset.name = ing.name;
    const key = ing.name ? canonicalName(ing.name) : '';
    if (ing.name && !inventorySet.has(key)) {
      ingTd.style.color = 'red';
      actionTd.appendChild(createAddButton(ing.name));
    }

    tr.appendChild(ingTd);
    tr.appendChild(amtTd);
    tr.appendChild(actionTd);
    rows.push(tr);

    if (ing.name) {
      if (!ingredientCells[key]) ingredientCells[key] = [];
      ingredientCells[key].push({ ingTd, actionTd });
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

    nameTd = document.createElement('td');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = meal.name || '';
    nameTd.appendChild(nameSpan);
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

    const prepTd = document.createElement('td');
    const prepChk = document.createElement('input');
    prepChk.type = 'checkbox';
    prepChk.checked = meal.prepared || false;
    prepChk.addEventListener('change', async () => {
      meal.prepared = prepChk.checked;
      await saveMeals(arr);
    });
    prepTd.appendChild(prepChk);

    const ingTd = document.createElement('td');
    ingTds.push(ingTd);
    const amtTd = document.createElement('td');
    const actionTd = document.createElement('td');
    tr.appendChild(useTd);
    tr.appendChild(imageTd);
    tr.appendChild(nameTd);
    tr.appendChild(prepTd);
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
    let changeBtn;
    let fileInput;
    let newImage = null;

    function checkSave() {
      const any =
        (mealInput && mealInput.value.trim()) ||
        ingredientInputs.some(i => i.value.trim()) ||
        newImage;
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

    imageTd.appendChild(changeBtn);
    imageTd.appendChild(fileInput);
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
      ingredientInputs.forEach(i => i.remove());
      ingredientInputs.length = 0;
      if (mealInput) mealInput.remove();
      if (saveBtn) saveBtn.remove();
      if (changeBtn) changeBtn.remove();
      if (fileInput) fileInput.remove();
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
  meals.forEach(meal => {
    const rows = createRows(meal, meals);
    rows.forEach(row => tbody.appendChild(row));
  });
  updateInventoryDisplay();
  await calculateAndSaveMealNeeds();
  window.scrollTo(0, scrollTop);
}

async function init() {
  await initializeMealCategories();
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

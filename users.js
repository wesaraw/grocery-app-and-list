import {
  loadUsers,
  saveUsers,
  loadUserCategoryDays,
  saveUserCategoryDays
} from './utils/userData.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';
import { sortItemsByCategory } from './utils/sortByCategory.js';

const btnContainer = document.getElementById('userButtons');
const mealList = document.getElementById('mealList');
const editBtn = document.getElementById('editNamesBtn');
const saveNamesBtn = document.getElementById('saveNamesBtn');

let users = [];
let userDays = [];
let addInput = null;
let saveBtn = null;
let addBtn = null;
let editInputs = [];
let editing = false;
const headerState = {};

function renderButtons() {
  btnContainer.innerHTML = '';
  users.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.addEventListener('click', () => showMeals(idx));
    btnContainer.appendChild(btn);
  });
  addBtn = document.createElement('button');
  addBtn.textContent = 'Add User';
  addBtn.addEventListener('click', () => startAddUser());
  btnContainer.appendChild(addBtn);

  if (editing) {
    startEditInputs();
  }
}

function startAddUser() {
  if (addInput) return;
  addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.placeholder = 'New user name';
  saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.display = 'none';
  addInput.addEventListener('input', () => {
    saveBtn.style.display = addInput.value.trim() ? 'inline' : 'none';
  });
  saveBtn.addEventListener('click', saveNewUser);
  btnContainer.insertBefore(addInput, addBtn);
  btnContainer.insertBefore(saveBtn, addBtn);
}

async function saveNewUser() {
  const val = addInput.value.trim();
  if (!val) return;
  users.push(val);
  userDays.push({});
  await Promise.all([saveUsers(users), saveUserCategoryDays(userDays)]);
  addInput.remove();
  saveBtn.remove();
  addInput = null;
  saveBtn = null;
  renderButtons();
}

function startEditInputs() {
  editInputs = [];
  const buttons = Array.from(btnContainer.querySelectorAll('button'));
  buttons.forEach((btn, idx) => {
    if (btn === addBtn) return;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'New name';
    inp.style.marginBottom = '5px';
    inp.addEventListener('input', checkEditInputs);
    btn.after(inp);
    editInputs[idx] = inp;
  });
}

function checkEditInputs() {
  const hasVal = editInputs.some(inp => inp.value.trim());
  saveNamesBtn.style.display = hasVal ? 'inline' : 'none';
}

async function saveNameEdits() {
  editInputs.forEach((inp, idx) => {
    const val = inp.value.trim();
    if (val) users[idx] = val;
    inp.remove();
  });
  editInputs = [];
  editing = false;
  saveNamesBtn.style.display = 'none';
  await saveUsers(users);
  renderButtons();
}

function loadMeals(type) {
  const info = MEAL_TYPES[type];
  const { key, path } = info;
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      const arr = data[key] ? data[key] : await loadJSON(path);
      arr.forEach(m => {
        if (!m.category) m.category = info.label;
      });
      resolve(arr);
    });
  });
}

async function loadAllMeals() {
  const all = [];
  for (const type of Object.keys(MEAL_TYPES)) {
    const meals = await loadMeals(type);
    all.push(...meals);
  }
  return all;
}

async function showMeals(userIndex) {
  const meals = await loadAllMeals();
  const usedMeals = [];
  meals.forEach(m => {
    let used = false;
    if (Array.isArray(m.users)) {
      used = m.users[userIndex];
    } else if (userIndex === 0) {
      const people = m.people ?? m.multiplier ?? (m.active === false ? 0 : 1);
      used = people > 0;
    }
    if (used) usedMeals.push(m);
  });
  const sorted = sortItemsByCategory(usedMeals);
  mealList.innerHTML = '';

  let lastCat = null;
  let header = null;
  let nodes = [];

  function finalizeHeader(cat, hdr, ns) {
    if (!hdr) return;
    const hidden = headerState[cat] !== undefined ? headerState[cat] : true;
    hdr.dataset.hidden = hidden ? 'true' : 'false';
    ns.forEach(n => {
      n.style.display = hidden ? 'none' : '';
    });
    hdr.style.cursor = 'pointer';
    hdr.addEventListener('click', () => {
      const isHidden = hdr.dataset.hidden === 'true';
      hdr.dataset.hidden = isHidden ? 'false' : 'true';
      ns.forEach(n => {
        n.style.display = isHidden ? '' : 'none';
      });
      headerState[cat] = !isHidden;
    });
  }

  const daysRec = userDays[userIndex] || {};

  sorted.forEach(m => {
    const cat = m.category || 'Other';
    if (cat !== lastCat) {
      finalizeHeader(lastCat, header, nodes);
      lastCat = cat;
      header = document.createElement('h3');
      header.className = 'category-header';
      header.textContent = cat;
      mealList.appendChild(header);

      const div = document.createElement('div');
      const label = document.createElement('span');
      label.textContent = 'Days per week: ';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = '7';
      input.step = 'any';
      input.value = daysRec[cat] ?? 1;
      const save = document.createElement('button');
      save.textContent = 'Save';
      save.className = 'hidden';
      function update() {
        const cur = daysRec[cat] ?? 1;
        if (input.value.trim() && parseFloat(input.value) !== parseFloat(cur)) {
          save.classList.remove('hidden');
        } else {
          save.classList.add('hidden');
        }
      }
      input.addEventListener('input', update);
      save.addEventListener('click', async () => {
        const val = parseFloat(input.value);
        if (isNaN(val)) return;
        if (!userDays[userIndex]) userDays[userIndex] = {};
        userDays[userIndex][cat] = val;
        await saveUserCategoryDays(userDays);
        save.classList.add('hidden');
        try { chrome.runtime.sendMessage({ type: 'inventory-updated' }); } catch (_) {}
      });
      div.appendChild(label);
      div.appendChild(input);
      div.appendChild(save);
      mealList.appendChild(div);
      nodes = [div];
    }
    const li = document.createElement('li');
    li.textContent = m.name || '';
    mealList.appendChild(li);
    nodes.push(li);
  });
  finalizeHeader(lastCat, header, nodes);
}

async function init() {
  await initializeMealCategories();
  users = await loadUsers();
  userDays = await loadUserCategoryDays();
  while (userDays.length < users.length) userDays.push({});
  renderButtons();
  editBtn.addEventListener('click', () => {
    if (editing) return;
    editing = true;
    startEditInputs();
  });
  saveNamesBtn.addEventListener('click', saveNameEdits);
}

document.addEventListener('DOMContentLoaded', init);

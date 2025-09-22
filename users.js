import {
  loadUsers,
  saveUsers,
  loadUserCategoryDays,
  saveUserCategoryDays,
  loadUserPortionMultipliers,
  saveUserPortionMultipliers
} from './utils/userData.js';
import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';
import { loadJSON } from './utils/dataLoader.js';
import {
  loadArray as loadItemArray,
  convertArrayToNames
} from './utils/itemStorage.js';
import { sortItemsByCategory } from './utils/sortByCategory.js';
import { openOrFocusWindow } from './utils/windowUtils.js';
import { loadMealSlotOverrides } from './utils/mealSlotOverrides.js';

const btnContainer = document.getElementById('userButtons');
const portionContainer = document.getElementById('portionMultiplierContainer');
const mealList = document.getElementById('mealList');
const editBtn = document.getElementById('editNamesBtn');
const saveNamesBtn = document.getElementById('saveNamesBtn');
const overrideBtn = document.getElementById('mealSlotOverrideBtn');

if (overrideBtn) {
  overrideBtn.addEventListener('click', () => {
    openOrFocusWindow('mealSlotOverride.html', 960, 720);
  });
}

let users = [];
let userDays = [];
let userPortionMultipliers = [];
let addInput = null;
let saveBtn = null;
let addBtn = null;
let editInputs = [];
let editing = false;
let currentUserIndex = null;
const headerState = {};

function clearPortionMultiplier() {
  if (!portionContainer) return;
  portionContainer.innerHTML = '';
  portionContainer.classList.remove('active');
}

function formatMultiplier(val) {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Number(val).toString();
  }
  return '1';
}

function renderPortionMultiplier(userIndex) {
  if (!portionContainer) return;
  const baseValue =
    typeof userPortionMultipliers[userIndex] === 'number' &&
    Number.isFinite(userPortionMultipliers[userIndex])
      ? userPortionMultipliers[userIndex]
      : 1;

  portionContainer.innerHTML = '';
  portionContainer.classList.add('active');

  const wrapper = document.createElement('div');
  wrapper.className = 'portion-multiplier';

  const inputId = `portion-multiplier-${userIndex}`;
  const label = document.createElement('label');
  label.setAttribute('for', inputId);
  label.textContent = 'Portion Size Multiplier';

  const input = document.createElement('input');
  input.type = 'number';
  input.id = inputId;
  input.step = 'any';
  input.value = formatMultiplier(baseValue);

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  portionContainer.appendChild(wrapper);

  let currentValue = baseValue;
  let isSaving = false;
  let queuedValue = null;

  async function persist(value) {
    if (isSaving) {
      queuedValue = value;
      return;
    }
    isSaving = true;
    try {
      userPortionMultipliers[userIndex] = value;
      await saveUserPortionMultipliers(userPortionMultipliers);
      await calculateAndSaveMealNeeds();
      try {
        chrome.runtime.sendMessage({ type: 'inventory-updated' });
      } catch (_) {}
    } finally {
      isSaving = false;
      if (queuedValue !== null) {
        const next = queuedValue;
        queuedValue = null;
        await persist(next);
      }
    }
  }

  async function commit() {
    const raw = input.value.trim();
    let nextValue;
    if (!raw) {
      nextValue = 1;
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        input.value = formatMultiplier(currentValue);
        return;
      }
      nextValue = parsed;
    }
    if (nextValue === currentValue) {
      input.value = formatMultiplier(currentValue);
      return;
    }
    currentValue = nextValue;
    input.value = formatMultiplier(currentValue);
    await persist(currentValue);
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  });
  input.addEventListener('blur', commit);
}

function renderButtons() {
  btnContainer.innerHTML = '';
  users.forEach((name, idx) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      currentUserIndex = idx;
      showMeals(idx);
    });
    btnContainer.appendChild(btn);
  });
  addBtn = document.createElement('button');
  addBtn.textContent = 'Add User';
  addBtn.addEventListener('click', () => startAddUser());
  btnContainer.appendChild(addBtn);

  if (editing) {
    startEditInputs();
  }

  if (
    typeof currentUserIndex === 'number' &&
    currentUserIndex >= 0 &&
    currentUserIndex < users.length
  ) {
    showMeals(currentUserIndex);
  } else {
    clearPortionMultiplier();
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
  userPortionMultipliers.push(1);
  await Promise.all([
    saveUsers(users),
    saveUserCategoryDays(userDays),
    saveUserPortionMultipliers(userPortionMultipliers)
  ]);
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

async function loadMeals(type) {
  const info = MEAL_TYPES[type];
  const { key, path } = info;
  let arr = await loadItemArray(key);
  if (!Array.isArray(arr) || arr.length === 0) {
    const fallback = await loadJSON(path);
    const fallbackArray = Array.isArray(fallback) ? fallback : [];
    arr = await convertArrayToNames(fallbackArray);
  }
  arr.forEach(m => {
    if (!m.category) m.category = info.label;
    if (m.prepared === undefined) m.prepared = false;
    if (m.recipeBook === undefined) m.recipeBook = '';
  });
  return arr;
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
  currentUserIndex = userIndex;
  renderPortionMultiplier(userIndex);
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
      label.textContent = 'Days: ';
      const save = document.createElement('button');
      save.textContent = 'Save';
      save.className = 'hidden';
      const checkboxes = [];
      const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const selected = Array.isArray(daysRec[cat]) ? daysRec[cat] : [];
      function update() {
        const vals = checkboxes.filter(c => c.chk.checked).map(c => c.day);
        const cur = Array.isArray(daysRec[cat]) ? daysRec[cat] : [];
        if (vals.join(',') !== cur.join(',')) {
          save.classList.remove('hidden');
        } else {
          save.classList.add('hidden');
        }
      }
      weekdays.forEach(day => {
        const lbl = document.createElement('label');
        lbl.style.marginRight = '4px';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = selected.includes(day);
        chk.addEventListener('change', update);
        lbl.appendChild(chk);
        lbl.appendChild(document.createTextNode(day.slice(0,3)));
        div.appendChild(lbl);
        checkboxes.push({ chk, day });
      });
      save.addEventListener('click', async () => {
        const vals = checkboxes.filter(c => c.chk.checked).map(c => c.day);
        if (!userDays[userIndex]) userDays[userIndex] = {};
        userDays[userIndex][cat] = vals;
        await saveUserCategoryDays(userDays);
        await calculateAndSaveMealNeeds();
        save.classList.add('hidden');
        try {
          chrome.runtime.sendMessage({ type: 'inventory-updated' });
        } catch (_) {}
      });
      div.insertBefore(label, div.firstChild);
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
  await loadMealSlotOverrides();
  users = await loadUsers();
  userDays = await loadUserCategoryDays();
  while (userDays.length < users.length) userDays.push({});
  userPortionMultipliers = await loadUserPortionMultipliers();
  let changed = false;
  if (userPortionMultipliers.length > users.length) {
    userPortionMultipliers = userPortionMultipliers.slice(0, users.length);
    changed = true;
  }
  while (userPortionMultipliers.length < users.length) {
    userPortionMultipliers.push(1);
    changed = true;
  }
  if (changed) {
    await saveUserPortionMultipliers(userPortionMultipliers);
  }
  renderButtons();
  editBtn.addEventListener('click', () => {
    if (editing) return;
    editing = true;
    startEditInputs();
  });
  saveNamesBtn.addEventListener('click', saveNameEdits);
}

document.addEventListener('DOMContentLoaded', init);

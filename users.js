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
import {
  loadMealSlotOverrides,
  loadMealSlotDescriptors,
  MEAL_SLOT_OVERRIDE_DAYS
} from './utils/mealSlotOverrides.js';

const btnContainer = document.getElementById('userButtons');
const portionContainer = document.getElementById('portionMultiplierContainer');
const mealList = document.getElementById('mealList');
const editBtn = document.getElementById('editNamesBtn');
const saveNamesBtn = document.getElementById('saveNamesBtn');
const overrideBtn = document.getElementById('mealSlotOverrideBtn');
const schedulerBtn = document.getElementById('mealSchedulerBtn');
const nutritionTargetsBtn = document.getElementById('nutritionTargetsBtn');

if (overrideBtn) {
  overrideBtn.addEventListener('click', () => {
    openOrFocusWindow('mealSlotOverride.html', 960, 720);
  });
}

if (schedulerBtn) {
  schedulerBtn.addEventListener('click', () => {
    openOrFocusWindow('mealScheduler.html', 960, 720);
  });
}

if (nutritionTargetsBtn) {
  nutritionTargetsBtn.addEventListener('click', () => {
    openOrFocusWindow('nutritionTargets.html', 520, 640);
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
const labelToCategoryId = new Map();
let slotDescriptorsByCategory = {};

const VALID_DAYS = Array.isArray(MEAL_SLOT_OVERRIDE_DAYS) && MEAL_SLOT_OVERRIDE_DAYS.length
  ? MEAL_SLOT_OVERRIDE_DAYS
  : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const VALID_DAY_SET = new Set(VALID_DAYS);
const DAY_ORDER = new Map(VALID_DAYS.map((day, idx) => [day, idx]));

function refreshCategoryLabelMap() {
  labelToCategoryId.clear();
  Object.entries(MEAL_TYPES).forEach(([id, info]) => {
    const label = info && info.label ? info.label : id;
    if (label && !labelToCategoryId.has(label)) {
      labelToCategoryId.set(label, id);
    }
  });
}

function normalizeDayList(list) {
  const normalized = [];
  const seen = new Set();
  if (Array.isArray(list)) {
    list.forEach(day => {
      if (VALID_DAY_SET.has(day) && !seen.has(day)) {
        seen.add(day);
        normalized.push(day);
      }
    });
  }
  normalized.sort((a, b) => (DAY_ORDER.get(a) || 0) - (DAY_ORDER.get(b) || 0));
  return normalized;
}

function normalizeSlotSelection(selection) {
  if (selection && typeof selection === 'object' && !Array.isArray(selection)) {
    const daysSource = Array.isArray(selection.days)
      ? selection.days
      : Array.isArray(selection.slots)
      ? selection.slots
      : [];
    const days = normalizeDayList(daysSource);
    const daySet = new Set(days);
    let prepSource = [];
    if (Array.isArray(selection.prep)) {
      prepSource = selection.prep;
    } else if (Array.isArray(selection.prepDays)) {
      prepSource = selection.prepDays;
    } else if (Array.isArray(selection.prepSlots)) {
      const first = selection.prepSlots[0];
      prepSource = Array.isArray(first) ? first : [];
    }
    const prep = normalizeDayList(prepSource).filter(day => daySet.has(day));
    return { days, prep };
  }
  const days = normalizeDayList(Array.isArray(selection) ? selection : []);
  return { days, prep: [] };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildDecoratedSlotValue(slotLists, slotCount) {
  const normalizedSlots = [];
  const normalizedPrepSlots = [];
  for (let i = 0; i < slotCount; i += 1) {
    const selection = normalizeSlotSelection(slotLists[i]);
    normalizedSlots.push(selection.days);
    normalizedPrepSlots.push(selection.prep);
  }
  const unionSet = new Set();
  normalizedSlots.forEach(slot => {
    slot.forEach(day => unionSet.add(day));
  });
  const union = normalizeDayList(Array.from(unionSet));
  const unionPrepSet = new Set();
  normalizedPrepSlots.forEach(prep => {
    prep.forEach(day => {
      if (unionSet.has(day)) unionPrepSet.add(day);
    });
  });
  const unionPrep = normalizeDayList(Array.from(unionPrepSet));
  union.slots = normalizedSlots.map(slot => slot.slice());
  union.prepSlots = normalizedPrepSlots.map(prep => prep.slice());
  union.prepDays = unionPrep.slice();
  return {
    decorated: union,
    slots: normalizedSlots,
    prepSlots: normalizedPrepSlots
  };
}

function readSlotLists(value) {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value.slots)) {
    const prepSlots = Array.isArray(value.prepSlots) ? value.prepSlots : [];
    return value.slots.map((slot, idx) =>
      normalizeSlotSelection({
        days: Array.isArray(slot) ? slot.slice() : [],
        prep: Array.isArray(prepSlots[idx]) ? prepSlots[idx].slice() : []
      })
    );
  }
  if (Array.isArray(value.slotDays)) {
    const prepSlots = Array.isArray(value.prepSlots) ? value.prepSlots : [];
    return value.slotDays.map((slot, idx) =>
      normalizeSlotSelection({
        days: Array.isArray(slot) ? slot.slice() : [],
        prep: Array.isArray(prepSlots[idx]) ? prepSlots[idx].slice() : []
      })
    );
  }
  if (Array.isArray(value)) {
    return [normalizeSlotSelection(value.slice())];
  }
  if (Array.isArray(value.days)) {
    return [
      normalizeSlotSelection({
        days: value.days.slice(),
        prep: Array.isArray(value.prepDays) ? value.prepDays.slice() : []
      })
    ];
  }
  return [];
}

function getCategoryIdForLabel(label) {
  if (!label) return null;
  if (labelToCategoryId.has(label)) {
    return labelToCategoryId.get(label);
  }
  if (MEAL_TYPES[label]) {
    return label;
  }
  return null;
}

function formatSlotHeaderLabel(descriptor, fallbackLabel, index, totalSlots) {
  const categoryLabel = descriptor?.categoryLabel || fallbackLabel;
  if (descriptor) {
    if (totalSlots > 1) {
      if (descriptor.roleLabel && descriptor.roleLabel !== descriptor.categoryLabel) {
        return `${categoryLabel} – ${descriptor.roleLabel} Slot`;
      }
      return `${categoryLabel} – Slot ${index + 1}`;
    }
    return categoryLabel;
  }
  if (totalSlots > 1) {
    return `${fallbackLabel} – Slot ${index + 1}`;
  }
  return fallbackLabel;
}

function attachHeader(key, header, nodes) {
  if (!header) return;
  const hidden = headerState[key] !== undefined ? headerState[key] : true;
  header.dataset.hidden = hidden ? 'true' : 'false';
  nodes.forEach(node => {
    node.style.display = hidden ? 'none' : '';
  });
  header.style.cursor = 'pointer';
  header.addEventListener('click', () => {
    const isHidden = header.dataset.hidden === 'true';
    header.dataset.hidden = isHidden ? 'false' : 'true';
    nodes.forEach(node => {
      node.style.display = isHidden ? '' : 'none';
    });
    headerState[key] = !isHidden;
  });
}

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
  const categoryId = info && info.id ? info.id : type;
  arr.forEach(m => {
    if (!m.categoryId) m.categoryId = categoryId;
    if (!m.category) m.category = info && info.label ? info.label : categoryId;
    if (m.prepared === undefined) m.prepared = false;
    if (m.leftoverOk === undefined) m.leftoverOk = false;
    if (m.recipeBook === undefined) m.recipeBook = '';
    if (typeof m.instructions !== 'string') {
      m.instructions = '';
    } else {
      m.instructions = m.instructions.trim();
    }
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

function createSlotController(initialDays, onSave) {
  const section = document.createElement('div');
  section.className = 'slot-section';

  const row = document.createElement('div');
  row.className = 'slot-days';

  const label = document.createElement('span');
  label.className = 'slot-days-label';
  label.textContent = 'Days:';
  row.appendChild(label);

  const checkboxContainer = document.createElement('div');
  checkboxContainer.className = 'slot-day-options';
  row.appendChild(checkboxContainer);

  const checkboxes = [];
  VALID_DAYS.forEach(day => {
    const lbl = document.createElement('label');
    lbl.className = 'slot-day-option';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = day;
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(day.slice(0, 3)));

    const prepWrapper = document.createElement('span');
    prepWrapper.className = 'slot-day-prep';
    const prepChk = document.createElement('input');
    prepChk.type = 'checkbox';
    prepChk.className = 'slot-day-prep-checkbox';
    prepChk.disabled = true;
    prepChk.setAttribute('aria-label', 'Prep required');
    prepWrapper.appendChild(prepChk);
    prepWrapper.appendChild(document.createTextNode('Prep'));
    lbl.appendChild(prepWrapper);

    checkboxContainer.appendChild(lbl);
    checkboxes.push({ chk, prepChk, day });
  });

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save';
  saveBtn.className = 'slot-save hidden';
  row.appendChild(saveBtn);

  section.appendChild(row);

  let savedSelection = normalizeSlotSelection(initialDays || []);

  function syncCheckboxes(selection) {
    const daySet = new Set(selection.days);
    const prepSet = new Set(selection.prep);
    checkboxes.forEach(({ chk, prepChk, day }) => {
      const checked = daySet.has(day);
      chk.checked = checked;
      prepChk.disabled = !checked;
      if (!checked) {
        prepChk.checked = false;
      } else {
        prepChk.checked = prepSet.has(day);
      }
    });
  }

  function getSelectedDays() {
    const selected = [];
    const prepSelected = [];
    checkboxes.forEach(({ chk, prepChk, day }) => {
      if (chk.checked) {
        selected.push(day);
        if (prepChk.checked) {
          prepSelected.push(day);
        }
      }
    });
    return normalizeSlotSelection({ days: selected, prep: prepSelected });
  }

  function updateDirtyState() {
    const current = getSelectedDays();
    if (arraysEqual(current.days, savedSelection.days) && arraysEqual(current.prep, savedSelection.prep)) {
      saveBtn.classList.add('hidden');
    } else {
      saveBtn.classList.remove('hidden');
    }
  }

  checkboxes.forEach(({ chk, prepChk }) => {
    chk.addEventListener('change', () => {
      if (!chk.checked) {
        prepChk.checked = false;
        prepChk.disabled = true;
      } else {
        prepChk.disabled = false;
      }
      updateDirtyState();
    });
    prepChk.addEventListener('change', updateDirtyState);
  });

  saveBtn.addEventListener('click', async () => {
    if (typeof onSave === 'function') {
      await onSave();
    }
  });

  syncCheckboxes(savedSelection);
  updateDirtyState();

  return {
    section,
    saveButton: saveBtn,
    getSelectedDays,
    syncSavedDays(selection) {
      savedSelection = normalizeSlotSelection(selection || []);
      syncCheckboxes(savedSelection);
      updateDirtyState();
    },
    setSaving(isSaving) {
      saveBtn.disabled = !!isSaving;
    }
  };
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

  const daysRec = userDays[userIndex] || {};
  const groups = [];
  const groupMap = new Map();

  sorted.forEach(meal => {
    const label = meal.category || 'Other';
    const categoryId = meal.categoryId || getCategoryIdForLabel(label);
    const key = categoryId || `label:${label}`;
    let group = groupMap.get(key);
    if (!group) {
      group = { id: categoryId, label, meals: [] };
      groupMap.set(key, group);
      groups.push(group);
    }
    group.meals.push(meal);
  });

  Object.keys(daysRec || {}).forEach(label => {
    const categoryId = getCategoryIdForLabel(label);
    const key = categoryId || `label:${label}`;
    if (!groupMap.has(key)) {
      const group = { id: categoryId, label, meals: [] };
      groupMap.set(key, group);
      groups.push(group);
    }
  });

  groups.forEach(group => {
    const categoryId = group.id;
    const descriptorList = categoryId ? slotDescriptorsByCategory[categoryId] || [] : [];
    const storedSlots = readSlotLists(daysRec[group.label]);
    const slotCount = Math.max(descriptorList.length, storedSlots.length, 1);
    const slotControllers = new Array(slotCount);

    function collectSelections() {
      const selections = [];
      for (let i = 0; i < slotCount; i += 1) {
        const ctrl = slotControllers[i];
        selections.push(ctrl ? ctrl.getSelectedDays() : { days: [], prep: [] });
      }
      return selections;
    }

    async function handleSave(slotIndex) {
      const controller = slotControllers[slotIndex];
      if (!controller) return;
      controller.setSaving(true);
      try {
        const selections = collectSelections();
        const { decorated, slots, prepSlots } = buildDecoratedSlotValue(selections, slotCount);
        if (!userDays[userIndex]) userDays[userIndex] = {};
        userDays[userIndex][group.label] = decorated;
        await saveUserCategoryDays(userDays);
        await calculateAndSaveMealNeeds();
        slotControllers.forEach((ctrl, idx) => {
          if (ctrl) {
            ctrl.syncSavedDays({
              days: slots[idx] || [],
              prep: prepSlots[idx] || []
            });
          }
        });
        try {
          chrome.runtime.sendMessage({ type: 'inventory-updated' });
        } catch (_) {}
      } finally {
        controller.setSaving(false);
      }
    }

    for (let i = 0; i < slotCount; i += 1) {
      const descriptor = descriptorList[i];
      const header = document.createElement('h3');
      header.className = 'category-header';
      header.textContent = formatSlotHeaderLabel(descriptor, group.label, i, slotCount);
      mealList.appendChild(header);

      const controller = createSlotController(storedSlots[i] || { days: [], prep: [] }, () => handleSave(i));
      slotControllers[i] = controller;
      mealList.appendChild(controller.section);

      const nodes = [controller.section];
      if (i === 0 && group.meals.length) {
        const list = document.createElement('ul');
        list.className = 'category-meals';
        group.meals.forEach(meal => {
          const li = document.createElement('li');
          li.textContent = meal.name || '';
          list.appendChild(li);
        });
        mealList.appendChild(list);
        nodes.push(list);
      }
      const headerKey = descriptor
        ? `slot:${descriptor.id}`
        : `slot:${categoryId || group.label}:${i}`;
      attachHeader(headerKey, header, nodes);
    }
  });
}

async function init() {
  await initializeMealCategories();
  refreshCategoryLabelMap();
  const descriptorData = await loadMealSlotDescriptors();
  slotDescriptorsByCategory = descriptorData?.byCategory || {};
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

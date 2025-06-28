import { loadUsers, saveUsers } from './utils/userData.js';
import { MEAL_TYPES } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';

const btnContainer = document.getElementById('userButtons');
const mealList = document.getElementById('mealList');

let users = [];
let addInput = null;
let saveBtn = null;
let addBtn = null;

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
  await saveUsers(users);
  addInput.remove();
  saveBtn.remove();
  addInput = null;
  saveBtn = null;
  renderButtons();
}

function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
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
  mealList.innerHTML = '';
  meals.forEach(m => {
    let used = false;
    if (Array.isArray(m.users)) {
      used = m.users[userIndex];
    } else if (userIndex === 0) {
      const people = m.people ?? m.multiplier ?? (m.active === false ? 0 : 1);
      used = people > 0;
    }
    if (used) {
      const li = document.createElement('li');
      li.textContent = m.name || '';
      mealList.appendChild(li);
    }
  });
}

async function init() {
  users = await loadUsers();
  renderButtons();
}

document.addEventListener('DOMContentLoaded', init);

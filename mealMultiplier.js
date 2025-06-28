import { MEAL_TYPES, DEFAULT_MEALS_PER_DAY, loadMealsPerDay, saveMealsPerDay } from './utils/mealData.js';

let data = {};

function buildRow(key, label, tbody) {
  const tr = document.createElement('tr');
  const catTd = document.createElement('td');
  catTd.textContent = label;
  const curTd = document.createElement('td');
  curTd.textContent = data[key];
  const inputTd = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'number';
  input.step = 'any';
  inputTd.appendChild(input);
  const saveTd = document.createElement('td');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'hidden';
  saveTd.appendChild(saveBtn);

  function update() {
    if (input.value.trim()) saveBtn.classList.remove('hidden');
    else saveBtn.classList.add('hidden');
  }

  input.addEventListener('input', update);
  saveBtn.addEventListener('click', async () => {
    const val = parseFloat(input.value);
    if (isNaN(val)) return;
    data[key] = val;
    await saveMealsPerDay(data);
    curTd.textContent = val;
    input.value = '';
    saveBtn.classList.add('hidden');
    try { chrome.runtime.sendMessage({ type: 'inventory-updated' }); } catch (_) {}
  });

  tr.appendChild(catTd);
  tr.appendChild(curTd);
  tr.appendChild(inputTd);
  tr.appendChild(saveTd);
  tbody.appendChild(tr);
}

async function init() {
  data = await loadMealsPerDay();
  const tbody = document.getElementById('multiplierBody');
  Object.keys(MEAL_TYPES).forEach(key => {
    const label = MEAL_TYPES[key].label;
    if (data[key] === undefined) data[key] = DEFAULT_MEALS_PER_DAY[key];
    buildRow(key, label, tbody);
  });
}

document.addEventListener('DOMContentLoaded', init);

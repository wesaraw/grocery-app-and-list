import { MEAL_TYPES, initializeMealCategories, loadCookingDays, saveCookingDays } from './utils/mealData.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';

const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let data = {};

function buildRow(cat, label, tbody) {
  const tr = document.createElement('tr');
  const catTd = document.createElement('td');
  catTd.textContent = label;
  const daysTd = document.createElement('td');
  daysTd.colSpan = 7;
  const boxes = [];
  WEEKDAYS.forEach(day => {
    const lbl = document.createElement('label');
    lbl.style.marginRight = '4px';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = (data[cat] || []).includes(day);
    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(day.slice(0,3)));
    daysTd.appendChild(lbl);
    boxes.push({chk, day});
  });
  const saveTd = document.createElement('td');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'hidden';
  saveTd.appendChild(saveBtn);

  function update() {
    const vals = boxes.filter(b => b.chk.checked).map(b => b.day);
    const cur = data[cat] || [];
    if (vals.join(',') !== cur.join(',')) saveBtn.classList.remove('hidden');
    else saveBtn.classList.add('hidden');
  }

  boxes.forEach(b => b.chk.addEventListener('change', update));

  saveBtn.addEventListener('click', async () => {
    data[cat] = boxes.filter(b => b.chk.checked).map(b => b.day);
    await saveCookingDays(data);
    await calculateAndSaveMealNeeds();
    saveBtn.classList.add('hidden');
  });

  tr.appendChild(catTd);
  tr.appendChild(daysTd);
  tr.appendChild(saveTd);
  tbody.appendChild(tr);
}

async function init() {
  await initializeMealCategories();
  data = await loadCookingDays();
  const tbody = document.getElementById('daysBody');
  Object.keys(MEAL_TYPES).forEach(cat => {
    if (!data[cat]) data[cat] = [];
    buildRow(cat, MEAL_TYPES[cat].label, tbody);
  });
}

document.addEventListener('DOMContentLoaded', init);

import { MEAL_TYPES, initializeMealCategories } from './utils/mealData.js';
import { loadUsers } from './utils/userData.js';

function loadCalendar() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('whatToEatCalendar', data => {
        resolve(data.whatToEatCalendar || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

let calendar = {};
let users = [];

function buildHeader() {
  const head = document.getElementById('tableHead');
  head.innerHTML = '';
  const tr = document.createElement('tr');
  const dateTh = document.createElement('th');
  dateTh.textContent = 'Date';
  tr.appendChild(dateTh);
  Object.values(MEAL_TYPES).forEach(cat => {
    const th = document.createElement('th');
    th.textContent = cat.label;
    tr.appendChild(th);
  });
  head.appendChild(tr);
}

function render() {
  const user = document.getElementById('userSelect').value;
  const startStr = document.getElementById('startDate').value;
  let date = startStr ? new Date(startStr) : new Date();
  const days = parseInt(document.getElementById('numDays').value, 10) || 7;
  const body = document.getElementById('calendarBody');
  body.innerHTML = '';
  for (let i = 0; i < days; i++) {
    const dStr = date.toISOString().split('T')[0];
    const row = document.createElement('tr');
    const dateTd = document.createElement('td');
    dateTd.textContent = dStr;
    row.appendChild(dateTd);
    const rec = calendar[user]?.[dStr] || {};
    Object.keys(MEAL_TYPES).forEach(cat => {
      const td = document.createElement('td');
      td.textContent = rec[cat] || '';
      row.appendChild(td);
    });
    body.appendChild(row);
    date.setDate(date.getDate() + 1);
  }
}

async function init() {
  await initializeMealCategories();
  users = await loadUsers();
  calendar = await loadCalendar();

  const userSelect = document.getElementById('userSelect');
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    userSelect.appendChild(opt);
  });
  if (users.length) userSelect.value = users[0];
  document.getElementById('startDate').value = new Date().toISOString().split('T')[0];
  buildHeader();
  document.getElementById('showBtn').addEventListener('click', render);
  render();
}

document.addEventListener('DOMContentLoaded', init);

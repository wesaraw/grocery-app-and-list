import { renderMealList } from '../meal-list/index.js';
import {
  importMealsFromFiles,
  rebuildCalendars
} from '../meal-planner/index.js';
import {
  get as storageGet,
  set as storageSet
} from '../services/storageService.js';

const root = document.getElementById('mealList');
renderMealList(root);

const fileInput = document.getElementById('import-files');
document.getElementById('importMeals').addEventListener('click', () =>
  fileInput.click()
);
fileInput.addEventListener('change', async e => {
  const files = e.target.files;
  if (files && files.length) {
    await importMealsFromFiles(files);
    await rebuildCalendars();
    await renderMealList(root);
    e.target.value = '';
  }
});

const userSelect = document.getElementById('threshold-user');
const thresholdInput = document.getElementById('threshold');
async function loadUsers() {
  const users = await storageGet('users', []);
  userSelect.innerHTML = '';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    userSelect.appendChild(opt);
  });
  if (users.length) {
    userSelect.value = users[0].id;
    thresholdInput.value = users[0].priceThresholds?.default ?? '';
  }
}
loadUsers();

userSelect.addEventListener('change', async () => {
  const users = await storageGet('users', []);
  const user = users.find(u => u.id === userSelect.value);
  thresholdInput.value = user?.priceThresholds?.default ?? '';
});

function parseVal() {
  const val = parseFloat(thresholdInput.value);
  return Number.isNaN(val) ? null : val;
}

document.getElementById('saveThreshold').addEventListener('click', async () => {
  const users = await storageGet('users', []);
  const user = users.find(u => u.id === userSelect.value);
  const val = parseVal();
  if (user && val != null) {
    user.priceThresholds = { ...(user.priceThresholds || {}), default: val };
    await storageSet('users', users);
    await rebuildCalendars();
  }
});

document
  .getElementById('rebuildCalendars')
  .addEventListener('click', async () => {
    await rebuildCalendars();
  });

document.getElementById('viewCalendar').addEventListener('click', () => {
  window.location.href = 'whatToEatCalendar.html';
});

document.getElementById('viewCookSchedule').addEventListener('click', () => {
  window.location.href = 'whatToCookWhen.html';
});

document.getElementById('editPlanPage').addEventListener('click', () => {
  window.location.href = 'edit-plan.html';
});

document.getElementById('addCategory').addEventListener('click', async () => {
  const label = prompt('Category name?');
  const name = label ? label.trim() : '';
  if (!name) return;
  const id = name.toLowerCase().replace(/\s+/g, '');
  const cats = await storageGet('meal-categories', []);
  if (cats.some(c => c.id === id)) return;
  cats.push({ id, label: name });
  await storageSet('meal-categories', cats);
  await renderMealList(root, { category: id });
});

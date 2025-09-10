import { get, set } from './storageService.js';
import { MEAL_CATEGORIES } from './constants.js';
import './meals.js';
import './users.js';
import './cookingDays.js';

const COLUMN_KEY = 'calendar-column-order';
const ORDER_VERSION = 1;
const DEFAULT_ORDER = MEAL_CATEGORIES.map(c => c.id);

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

function buildSlotIds(order) {
  return order.map((cat, idx) => `${cat}#${idx}`);
}

async function renderCalendarView(root) {
  const [users = [], meals = [], calendarObj = { }, orderObj = { } ] = await Promise.all([
    get('users', []),
    get('meals', []),
    get('what-to-eat-calendar', { calendar: {}, version: 1 }),
    get(COLUMN_KEY, { version: ORDER_VERSION, order: {} })
  ]);

  const mealMap = new Map(meals.map(m => [m.id, m]));
  let calendar = calendarObj.calendar || {};
  let columnOrder = orderObj.order || {};
  let slotOrder = DEFAULT_ORDER.slice();
  let slotOrderIds = buildSlotIds(slotOrder);
  let editMode = false;
  let dragInfo = null;

  const container = document.createElement('div');
  const controls = document.createElement('div');

  // Basic styles mirroring the legacy layout.
  const style = document.createElement('style');
  style.textContent = `
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 4px; border-bottom: 1px solid #ccc; vertical-align: top; }
    .meal-img { width: 50px; height: 50px; object-fit: contain; background: #ccc; display: block; margin-top: 2px; }
  `;
  container.appendChild(style);

  const userSelect = document.createElement('select');
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    userSelect.appendChild(opt);
  });
  controls.append('User:', userSelect);

  const startInput = document.createElement('input');
  startInput.type = 'date';
  controls.append(' Start:', startInput);

  const dayInput = document.createElement('input');
  dayInput.type = 'number';
  dayInput.min = '1';
  dayInput.max = '365';
  dayInput.value = '7';
  controls.append(' Days:', dayInput);

  const showBtn = document.createElement('button');
  showBtn.textContent = 'Show';
  controls.appendChild(showBtn);

  const cookBtn = document.createElement('button');
  cookBtn.textContent = 'What To Cook When';
  controls.appendChild(cookBtn);

  container.appendChild(controls);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  container.appendChild(table);

  const reorderBtn = document.createElement('button');
  reorderBtn.textContent = 'Reorder Columns';
  const saveOrderBtn = document.createElement('button');
  saveOrderBtn.textContent = 'Save Order';
  saveOrderBtn.style.display = 'none';
  container.append(reorderBtn, saveOrderBtn);

  root.innerHTML = '';
  root.appendChild(container);

  function applySavedOrderForUser(userId) {
    slotOrder = DEFAULT_ORDER.slice();
    slotOrderIds = buildSlotIds(slotOrder);
    const saved = columnOrder[userId];
    if (Array.isArray(saved) && saved.length === slotOrderIds.length) {
      slotOrderIds = saved.slice();
      slotOrder = slotOrderIds.map(id => id.split('#')[0]);
    }
  }

  function moveColumn(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= slotOrderIds.length) return;
    const tmp = slotOrderIds[idx];
    slotOrderIds[idx] = slotOrderIds[newIdx];
    slotOrderIds[newIdx] = tmp;
    slotOrder = slotOrderIds.map(id => id.split('#')[0]);
    buildHeader(true);
  }

  function buildHeader(editing = false) {
    thead.innerHTML = '';
    if (editing) {
      const arrowRow = document.createElement('tr');
      arrowRow.appendChild(document.createElement('th'));
      slotOrder.forEach((_, idx) => {
        const th = document.createElement('th');
        const left = document.createElement('button');
        left.textContent = '\u2190';
        left.addEventListener('click', () => moveColumn(idx, -1));
        const right = document.createElement('button');
        right.textContent = '\u2192';
        right.addEventListener('click', () => moveColumn(idx, 1));
        th.append(left, document.createTextNode(' '), right);
        arrowRow.appendChild(th);
      });
      thead.appendChild(arrowRow);
    }
    const row = document.createElement('tr');
    const dateTh = document.createElement('th');
    dateTh.textContent = 'Date';
    row.appendChild(dateTh);
    slotOrder.forEach(cat => {
      const th = document.createElement('th');
      const catInfo = MEAL_CATEGORIES.find(c => c.id === cat);
      th.textContent = catInfo ? catInfo.label : cat;
      row.appendChild(th);
    });
    thead.appendChild(row);
  }

  function render() {
    const userId = userSelect.value;
    const startStr = startInput.value;
    let date = startStr ? new Date(startStr) : new Date();
    const days = parseInt(dayInput.value, 10) || 7;
    tbody.innerHTML = '';
    for (let i = 0; i < days; i++) {
      const row = document.createElement('tr');
      const dStr = date.toISOString().split('T')[0];
      const dateTd = document.createElement('td');
      dateTd.textContent = dStr;
      row.appendChild(dateTd);
      slotOrder.forEach(cat => {
        const td = document.createElement('td');
        const seq = calendar[userId]?.[cat] || [];
        const seqIdx = seq.length ? i % seq.length : -1;
        td.dataset.cat = cat;
        td.dataset.pos = seqIdx;
        const mealId = seqIdx >= 0 ? seq[seqIdx] : null;
        const meal = mealMap.get(mealId);
        if (meal) {
          const nameDiv = document.createElement('div');
          let text = meal.name;
          if (meal.totalCost != null) text += ` - $${meal.totalCost.toFixed(2)}`;
          nameDiv.textContent = text;
          nameDiv.draggable = true;
          nameDiv.dataset.cat = cat;
          nameDiv.dataset.pos = seqIdx;
          nameDiv.addEventListener('dragstart', e => {
            dragInfo = { cat, pos: seqIdx };
            e.dataTransfer.effectAllowed = 'move';
          });
          td.appendChild(nameDiv);
          if (meal.image) {
            const img = document.createElement('img');
            img.className = 'meal-img';
            img.src = meal.image;
            td.appendChild(img);
          }
        }
        td.addEventListener('dragover', e => e.preventDefault());
        td.addEventListener('drop', async e => {
          e.preventDefault();
          if (!dragInfo) return;
          const targetCat = td.dataset.cat;
          const targetPos = parseInt(td.dataset.pos, 10);
          if (dragInfo.cat !== targetCat || targetPos < 0 || dragInfo.pos === targetPos) {
            dragInfo = null;
            return;
          }
          const seq = calendar[userId][targetCat] || [];
          const tmp = seq[dragInfo.pos];
          seq[dragInfo.pos] = seq[targetPos];
          seq[targetPos] = tmp;
          await saveOverride(userId, targetCat, seq);
          calendar[userId][targetCat] = seq;
          dragInfo = null;
          render();
        });
        row.appendChild(td);
      });
      tbody.appendChild(row);
      date.setDate(date.getDate() + 1);
    }
  }

  function startReorder() {
    if (editMode) return;
    editMode = true;
    saveOrderBtn.style.display = 'inline-block';
    buildHeader(true);
  }

  async function saveOrder() {
    const userId = userSelect.value;
    columnOrder[userId] = slotOrderIds.slice();
    await set(COLUMN_KEY, { version: ORDER_VERSION, order: columnOrder });
    editMode = false;
    saveOrderBtn.style.display = 'none';
    buildHeader(false);
  }

  function openCookView() {
    const params = new URLSearchParams();
    if (startInput.value) params.set('start', startInput.value);
    if (dayInput.value) params.set('days', dayInput.value);
    const url = 'whatToCookWhen.html' + (params.toString() ? `?${params}` : '');
    window.location.href = url;
  }

  reorderBtn.addEventListener('click', startReorder);
  saveOrderBtn.addEventListener('click', saveOrder);
  showBtn.addEventListener('click', render);
  cookBtn.addEventListener('click', openCookView);
  userSelect.addEventListener('change', () => {
    applySavedOrderForUser(userSelect.value);
    buildHeader(editMode);
    render();
  });

  if (users.length) {
    userSelect.value = users[0].id;
    applySavedOrderForUser(users[0].id);
  }
  const todayStr = new Date().toISOString().split('T')[0];
  startInput.value = todayStr;
  buildHeader();
  render();

  // Refresh view when calendars are rebuilt elsewhere
  document.addEventListener('calendars-updated', async () => {
    const updated = await get('what-to-eat-calendar', { calendar: {}, version: 1 });
    calendar = updated.calendar || {};
    render();
  });

  async function saveOverride(userId, catId, seq) {
    const week = getCurrentWeek();
    const overrides = (await get('manual-meal-overrides', { week, users: {} })) || {};
    if (!overrides.users) overrides.users = {};
    if (!overrides.users[userId]) overrides.users[userId] = {};
    overrides.users[userId][catId] = seq.slice();
    overrides.week = week;
    await set('manual-meal-overrides', overrides);
    const mod = await import('./index4.js');
    if (mod.rebuildCalendars) await mod.rebuildCalendars();
  }
}

var calendarView = { renderCalendarView };

export { calendarView as default, renderCalendarView };
//# sourceMappingURL=calendarView.js.map

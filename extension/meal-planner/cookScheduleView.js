import { get } from '../storageService.js';

async function renderCookScheduleView(root) {
  const [
    users = [],
    meals = [],
    calendarObj = { },
    cookingDays = { }
  ] = await Promise.all([
    get('users', []),
    get('meals', []),
    get('what-to-eat-calendar', { calendar: {}, version: 1 }),
    get('cooking-days', { categories: {}, prepDay: null, version: 1 })
  ]);

  const mealMap = new Map(meals.map(m => [m.id, m]));
  const calendar = calendarObj.calendar || {};
  const prepDay = cookingDays.prepDay;

  const container = document.createElement('div');
  const controls = document.createElement('div');

  const style = document.createElement('style');
  style.textContent = `
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 4px; border-bottom: 1px solid #ccc; vertical-align: top; }
  `;
  container.appendChild(style);

  const startInput = document.createElement('input');
  startInput.type = 'date';
  controls.append('Start:', startInput);

  const dayInput = document.createElement('input');
  dayInput.type = 'number';
  dayInput.min = '1';
  dayInput.max = '365';
  dayInput.value = '7';
  controls.append(' Days:', dayInput);

  const showBtn = document.createElement('button');
  showBtn.textContent = 'Show';
  controls.appendChild(showBtn);

  const eatBtn = document.createElement('button');
  eatBtn.textContent = 'What To Eat When';
  controls.appendChild(eatBtn);

  container.appendChild(controls);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  container.appendChild(table);

  root.innerHTML = '';
  root.appendChild(container);

  const headerRow = document.createElement('tr');
  ['Date', 'Meals', 'Prep Ahead'].forEach(txt => {
    const th = document.createElement('th');
    th.textContent = txt;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  function buildRows() {
    const startStr = startInput.value;
    let date = startStr ? new Date(startStr) : new Date();
    const days = parseInt(dayInput.value, 10) || 7;

    let calcDays = days;
    if (prepDay) {
      const last = new Date(date);
      last.setDate(last.getDate() + days - 1);
      while (true) {
        last.setDate(last.getDate() + 1);
        calcDays++;
        const dayName = last.toLocaleDateString('en-US', { weekday: 'long' });
        if (dayName === prepDay) break;
      }
    }

    const rows = [];
    for (let i = 0; i < calcDays; i++) {
      const dStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      const counts = {};
      const ahead = {};
      users.forEach(u => {
        const cal = calendar[u.id] || {};
        Object.values(cal).forEach(seq => {
          if (!Array.isArray(seq) || !seq.length) return;
          const mealId = seq[i % seq.length];
          const meal = mealMap.get(mealId);
          if (meal?.flags?.prepared) counts[mealId] = (counts[mealId] || 0) + 1;
          if (meal?.flags?.prepAhead) ahead[mealId] = (ahead[mealId] || 0) + 1;
        });
      });
      rows.push({ date: dStr, dayName, counts, ahead });
      date.setDate(date.getDate() + 1);
    }

    for (let i = 0; i < rows.length; i++) {
      if (prepDay && rows[i].dayName === prepDay) {
        const next = rows.slice(i + 1).findIndex(r => r.dayName === prepDay);
        const end = next === -1 ? rows.length : i + 1 + next;
        const totals = {};
        for (let j = i + 1; j < end; j++) {
          Object.entries(rows[j].ahead).forEach(([id, c]) => {
            totals[id] = (totals[id] || 0) + c;
          });
        }
        rows[i].prepList = totals;
      }
    }

    return rows.slice(0, days);
  }

  function render() {
    const rows = buildRows();
    tbody.innerHTML = '';
    rows.forEach(({ date, counts, prepList }) => {
      const tr = document.createElement('tr');
      const dateTd = document.createElement('td');
      dateTd.textContent = date;
      tr.appendChild(dateTd);
      const mealsTd = document.createElement('td');
      Object.entries(counts).forEach(([id, cnt]) => {
        const div = document.createElement('div');
        div.textContent = `${mealMap.get(id)?.name || id} (${cnt})`;
        mealsTd.appendChild(div);
      });
      tr.appendChild(mealsTd);
      const prepTd = document.createElement('td');
      if (prepList) {
        Object.entries(prepList).forEach(([id, cnt]) => {
          const div = document.createElement('div');
          div.textContent = `${mealMap.get(id)?.name || id} (${cnt})`;
          prepTd.appendChild(div);
        });
      }
      tr.appendChild(prepTd);
      tbody.appendChild(tr);
    });
  }

  function openEatView() {
    const params = new URLSearchParams();
    if (startInput.value) params.set('start', startInput.value);
    if (dayInput.value) params.set('days', dayInput.value);
    const url = 'whatToEatCalendar.html' + (params.toString() ? `?${params}` : '');
    window.location.href = url;
  }

  showBtn.addEventListener('click', render);
  eatBtn.addEventListener('click', openEatView);

  const params = new URLSearchParams(location.search);
  const startParam = params.get('start');
  const daysParam = parseInt(params.get('days') || '7', 10);
  const todayStr = new Date().toISOString().split('T')[0];
  startInput.value = startParam || todayStr;
  dayInput.value = daysParam;

  render();
}

var cookScheduleView = { renderCookScheduleView };

export { cookScheduleView as default, renderCookScheduleView };
//# sourceMappingURL=cookScheduleView.js.map

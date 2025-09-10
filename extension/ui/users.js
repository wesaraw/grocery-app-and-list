import { get, set, updateItemById } from '../storageService.js';

let users = [];
let schedules = [];
const daysFull = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

async function load() {
  users = await get('users');
  schedules = await get('user-category-days');
  if (!Array.isArray(users)) users = [];
  if (!Array.isArray(schedules)) schedules = [];
  while (schedules.length < users.length) {
    const id = users[schedules.length].id;
    schedules.push({ userId: id, schedule: {}, version: 1 });
  }
  await set('user-category-days', schedules);
  renderUsers();
}

function renderUsers() {
  const container = document.getElementById('userList');
  container.innerHTML = '';
  users.forEach(u => {
    const wrap = document.createElement('div');
    const btn = document.createElement('button');
    btn.textContent = u.name;
    btn.addEventListener('click', () => renderSchedule(u.id));
    wrap.appendChild(btn);

    const edit = document.createElement('button');
    edit.textContent = 'Rename';
    edit.addEventListener('click', async () => {
      const name = prompt('New name', u.name);
      if (!name) return;
      await updateItemById('users', u.id, { name });
      users = await get('users');
      renderUsers();
    });
    wrap.appendChild(edit);
    container.appendChild(wrap);
  });
}

async function addUser() {
  const name = prompt('User name?');
  if (!name) return;
  const id = `u${Date.now()}`;
  const user = { id, name, version: 1 };
  users.push(user);
  schedules.push({ userId: id, schedule: {}, version: 1 });
  await Promise.all([set('users', users), set('user-category-days', schedules)]);
  renderUsers();
}

document.getElementById('addUser').addEventListener('click', addUser);

function renderSchedule(userId) {
  const sched = schedules.find(s => s.userId === userId) || { userId, schedule: {}, version: 1 };
  const container = document.getElementById('schedule');
  container.innerHTML = '';
  const defaultCats = ['Breakfast', 'Lunch', 'Dinner'];
  const categories = Array.from(new Set([...defaultCats, ...Object.keys(sched.schedule)]));
  categories.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'category';
    const label = document.createElement('span');
    label.textContent = `${cat}: `;
    div.appendChild(label);
    daysFull.forEach(day => {
      const lbl = document.createElement('label');
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = Array.isArray(sched.schedule[cat]) && sched.schedule[cat].includes(day);
      chk.addEventListener('change', async () => {
        let arr = Array.isArray(sched.schedule[cat]) ? sched.schedule[cat] : [];
        if (chk.checked) {
          if (!arr.includes(day)) arr.push(day);
        } else {
          arr = arr.filter(d => d !== day);
        }
        sched.schedule[cat] = arr;
        await set('user-category-days', schedules);
      });
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(day.slice(0,3)));
      div.appendChild(lbl);
    });
    container.appendChild(div);
  });
}

load();

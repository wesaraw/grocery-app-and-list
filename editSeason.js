import { loadJSON } from './utils/dataLoader.js';
import { loadItemSeasons, saveItemSeasons } from './utils/seasonData.js';
import { sortItemsByCategory, renderItemsWithCategoryHeaders } from './utils/sortByCategory.js';
import { loadArray as loadItemArray } from './utils/itemRegistry.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

async function loadNeeds() {
  const arr = await loadItemArray('yearlyNeeds');
  if (arr.length > 0) return arr;
  return await loadJSON(NEEDS_PATH);
}

function parseMonthVal(v) {
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d)) return String(d.getMonth() + 1);
    return '';
  }
  return String(parseInt(v, 10) || '');
}

function createSeasonRow(container, start = '', end = '') {
  const row = document.createElement('div');
  row.className = 'season-row';
  const s = document.createElement('input');
  s.type = 'number';
  s.min = '1';
  s.max = '12';
  s.className = 'season-start';
  if (start) s.value = parseMonthVal(start);
  const e = document.createElement('input');
  e.type = 'number';
  e.min = '1';
  e.max = '12';
  e.className = 'season-end';
  if (end) e.value = parseMonthVal(end);
  const del = document.createElement('button');
  del.textContent = 'Remove';
  del.type = 'button';
  del.addEventListener('click', () => row.remove());
  row.appendChild(s);
  row.appendChild(document.createTextNode(' '));
  row.appendChild(e);
  row.appendChild(document.createTextNode(' '));
  row.appendChild(del);
  container.appendChild(row);
}

async function init() {
  const [needs, seasons] = await Promise.all([loadNeeds(), loadItemSeasons()]);
  const items = sortItemsByCategory(needs);
  const container = document.getElementById('items');
  const headerState = {};

  function createRow(item) {
    const div = document.createElement('div');
    div.className = 'item';
    const span = document.createElement('span');
    span.textContent = item.name;
    div.appendChild(span);
    const sc = document.createElement('div');
    (seasons[item.name] || []).forEach(r => {
      createSeasonRow(sc, r.start, r.end);
    });
    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add';
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => createSeasonRow(sc));
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', async () => {
      const rows = Array.from(sc.querySelectorAll('.season-row'));
      const arr = rows
        .map(r => {
          const start = parseInt(r.querySelector('.season-start').value, 10);
          const end = parseInt(r.querySelector('.season-end').value, 10);
          if (!isNaN(start) && !isNaN(end)) return { start, end };
          return null;
        })
        .filter(Boolean);
      seasons[item.name] = arr;
      await saveItemSeasons(seasons);
    });
    div.appendChild(sc);
    div.appendChild(addBtn);
    div.appendChild(document.createTextNode(' '));
    div.appendChild(saveBtn);
    return div;
  }

  let filterText = '';
  function render() {
    const arr = filterText
      ? items.filter(n => n.name.toLowerCase().includes(filterText))
      : items;
    container.innerHTML = '';
    renderItemsWithCategoryHeaders(arr, container, createRow, headerState);
  }

  render();
  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

document.addEventListener('DOMContentLoaded', init);

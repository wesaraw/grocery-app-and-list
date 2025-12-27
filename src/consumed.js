import { loadJSON } from './utils/dataLoader.js';
import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';
import {
  loadArray as loadItemArray,
  saveArray as saveItemArray,
  loadObject as loadItemObject,
  saveObject as saveItemObject,
  convertArrayToNames
} from './utils/itemStorage.js';
import { formatQuantity } from './utils/quantityFormat.js';

const NEEDS_KEY = 'yearlyNeeds';
const CONSUMED_KEY = 'consumedThisYear';
const HISTORY_KEY = 'consumedHistory';
const OVERRIDES_KEY = 'consumptionOverrides';

const NEEDS_PATH = 'data/required-for-grocery-app/yearly_needs_with_manual_flags.json';


let filterText = '';
const headerState = {};
let allNeeds = [];
let globalMap;
let globalHistory;
let globalOverrides;
let container;

async function loadNeeds() {
  const arr = await loadItemArray(NEEDS_KEY);
  if (arr.length > 0) return arr;
  const needs = await loadJSON(NEEDS_PATH);
  return await convertArrayToNames(needs);
}

async function loadConsumption() {
  const arr = await loadItemArray(CONSUMED_KEY);
  if (arr.length > 0) return arr;
  const needs = await loadNeeds();
  return needs.map(n => ({ name: n.name, amount: 0, unit: n.home_unit }));
}

function saveConsumption(cons) {
  return saveItemArray(CONSUMED_KEY, cons);
}

async function loadHistory() {
  return await loadItemObject(HISTORY_KEY);
}

async function loadOverrides() {
  return await loadItemObject(OVERRIDES_KEY);
}

function saveOverrides(overrides) {
  return saveItemObject(OVERRIDES_KEY, overrides);
}

function saveHistory(hist) {
  return saveItemObject(HISTORY_KEY, hist);
}

function updateHistoryList(name, ul, span, map, history, overrides, weekly) {
  ul.innerHTML = '';
  const entries = history[name] || [];
  entries.forEach(entry => {
    const li = document.createElement('li');
    li.textContent = `${entry.date} : ${entry.diff > 0 ? '+' : ''}${entry.diff}`;
    const btn = document.createElement('button');
    btn.textContent = 'X';
    btn.addEventListener('click', async () => {
      const rec = map.get(name);
      rec.amount -= entry.diff;
      const weeklyText = weekly ? ` - ${formatQuantity(weekly)}/wk` : '';
      span.textContent = `${rec.name} - ${rec.amount} ${rec.unit}${weeklyText}`;
      const arr = history[name] || [];
      const idx = arr.findIndex(e => e.id === entry.id);
      if (idx !== -1) arr.splice(idx, 1);
      history[name] = arr;
      if (entry.week !== undefined && overrides[name] && overrides[name][entry.week] !== undefined) {
        overrides[name][entry.week] -= entry.diff;
        if (Math.abs(overrides[name][entry.week]) < 1e-9) {
          delete overrides[name][entry.week];
        }
        if (Object.keys(overrides[name]).length === 0) {
          delete overrides[name];
        }
      }
      await saveConsumption(Array.from(map.values()));
      await saveHistory(history);
      await saveOverrides(overrides);
      updateHistoryList(name, ul, span, map, history, overrides, weekly);
    });
    li.appendChild(document.createTextNode(' '));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function createItemRow(item, map, history, overrides, weekly) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  const weeklyText = weekly ? ` - ${formatQuantity(weekly)}/wk` : '';
  span.textContent = `${item.name} - ${item.amount} ${item.unit}${weeklyText}`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'Change';

  const weekInput = document.createElement('input');
  weekInput.type = 'number';
  weekInput.placeholder = 'Week';
  weekInput.min = 1;
  weekInput.max = 52;
  weekInput.className = 'week-input';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const change = parseFloat(input.value);
      const week = parseInt(weekInput.value, 10);
      if (!isNaN(change) && !isNaN(week)) {
        item.amount += change;
        const wkTxt = weekly ? ` - ${formatQuantity(weekly)}/wk` : '';
        span.textContent = `${item.name} - ${item.amount} ${item.unit}${wkTxt}`;
        const arr = history[item.name] || [];
        arr.unshift({ id: Date.now(), date: new Date().toLocaleDateString(), diff: change, week });
        history[item.name] = arr;
        if (!overrides[item.name]) overrides[item.name] = {};
        overrides[item.name][week] = (overrides[item.name][week] || 0) + change;
        await saveConsumption(Array.from(map.values()));
        await saveHistory(history);
        await saveOverrides(overrides);
        updateHistoryList(item.name, ul, span, map, history, overrides, weekly);
        input.value = '';
        weekInput.value = '';
      }
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(weekInput);

  const ul = document.createElement('ul');
  ul.className = 'history';
  div.appendChild(ul);
  updateHistoryList(item.name, ul, span, map, history, overrides, weekly);

  return div;
}

async function init() {
  container = document.getElementById('consumption');
  const [consumed, history, needs, overrides] = await Promise.all([
    loadConsumption(),
    loadHistory(),
    loadNeeds(),
    loadOverrides()
  ]);
  allNeeds = sortItemsByCategory(needs);
  globalMap = new Map(consumed.map(i => [i.name, i]));
  globalHistory = history;
  globalOverrides = overrides;
  allNeeds.forEach(n => {
    if (!globalMap.has(n.name)) {
      const it = { name: n.name, amount: 0, unit: n.home_unit };
      globalMap.set(n.name, it);
      consumed.push(it);
    }
  });

  function render() {
    container.innerHTML = '';
    const filtered = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    renderItemsWithCategoryHeaders(filtered, container, n => {
      const item = globalMap.get(n.name);
      const weekly = n.total_needed_year ? n.total_needed_year / 52 : 0;
      return createItemRow(item, globalMap, globalHistory, globalOverrides, weekly);
    }, headerState);
  }

  render();
  await saveConsumption(Array.from(globalMap.values()));
  await saveOverrides(globalOverrides);

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });
}

document.addEventListener('DOMContentLoaded', init);

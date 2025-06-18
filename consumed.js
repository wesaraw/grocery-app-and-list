import { loadJSON } from './utils/dataLoader.js';

const NEEDS_KEY = 'yearlyNeeds';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

function loadNeeds() {
  return new Promise(async resolve => {
    chrome.storage.local.get(NEEDS_KEY, async data => {
      if (data[NEEDS_KEY]) {
        resolve(data[NEEDS_KEY]);
      } else {
        const needs = await loadJSON(NEEDS_PATH);
        resolve(needs);
      }
    });
  });
}

async function loadConsumption() {
  return new Promise(async resolve => {
    chrome.storage.local.get('consumedThisYear', async data => {
      if (data.consumedThisYear) {
        resolve(data.consumedThisYear);
      } else {
        const needs = await loadNeeds();
        resolve(needs.map(n => ({ name: n.name, amount: 0, unit: n.home_unit })));
      }
    });
  });
}

function saveConsumption(cons) {
  return new Promise(resolve => {
    chrome.storage.local.set({ consumedThisYear: cons }, () => resolve());
  });
}

async function loadHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get('consumedHistory', data => {
      resolve(data.consumedHistory || {});
    });
  });
}

async function loadOverrides() {
  return new Promise(resolve => {
    chrome.storage.local.get('consumptionOverrides', data => {
      resolve(data.consumptionOverrides || {});
    });
  });
}

function saveOverrides(overrides) {
  return new Promise(resolve => {
    chrome.storage.local.set({ consumptionOverrides: overrides }, () => resolve());
  });
}

function saveHistory(hist) {
  return new Promise(resolve => {
    chrome.storage.local.set({ consumedHistory: hist }, () => resolve());
  });
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
      const weeklyText = weekly ? ` - ${weekly.toFixed(2)}/wk` : '';
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
  const weeklyText = weekly ? ` - ${weekly.toFixed(2)}/wk` : '';
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
        const wkTxt = weekly ? ` - ${weekly.toFixed(2)}/wk` : '';
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
  const container = document.getElementById('consumption');
  const [consumed, history, needs, overrides] = await Promise.all([
    loadConsumption(),
    loadHistory(),
    loadNeeds(),
    loadOverrides()
  ]);
  const map = new Map(consumed.map(i => [i.name, i]));
  // ensure all needs exist
  needs.forEach(n => {
    if (!map.has(n.name)) {
      const it = { name: n.name, amount: 0, unit: n.home_unit };
      map.set(n.name, it);
      consumed.push(it);
    }
  });
  // render in needs order
  needs.forEach(n => {
    const item = map.get(n.name);
    const weekly = n.total_needed_year ? n.total_needed_year / 52 : 0;
    const row = createItemRow(item, map, history, overrides, weekly);
    container.appendChild(row);
  });
  await saveConsumption(Array.from(map.values()));
  await saveOverrides(overrides);
}

document.addEventListener('DOMContentLoaded', init);

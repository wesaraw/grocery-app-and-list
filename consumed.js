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

function saveHistory(hist) {
  return new Promise(resolve => {
    chrome.storage.local.set({ consumedHistory: hist }, () => resolve());
  });
}

function updateHistoryList(name, ul, span, map, history) {
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
      span.textContent = `${rec.name} - ${rec.amount} ${rec.unit}`;
      const arr = history[name] || [];
      const idx = arr.findIndex(e => e.id === entry.id);
      if (idx !== -1) arr.splice(idx, 1);
      history[name] = arr;
      await saveConsumption(Array.from(map.values()));
      await saveHistory(history);
      updateHistoryList(name, ul, span, map, history);
    });
    li.appendChild(document.createTextNode(' '));
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

function createItemRow(item, map, history) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = `${item.name} - ${item.amount} ${item.unit}`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'New';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        const old = item.amount;
        const diff = val - old;
        item.amount = val;
        span.textContent = `${item.name} - ${item.amount} ${item.unit}`;
        const arr = history[item.name] || [];
        arr.unshift({ id: Date.now(), date: new Date().toLocaleDateString(), diff });
        history[item.name] = arr;
        await saveConsumption(Array.from(map.values()));
        await saveHistory(history);
        updateHistoryList(item.name, ul, span, map, history);
        input.value = '';
      }
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);

  const ul = document.createElement('ul');
  ul.className = 'history';
  div.appendChild(ul);
  updateHistoryList(item.name, ul, span, map, history);

  return div;
}

async function init() {
  const container = document.getElementById('consumption');
  const [consumed, history, needs] = await Promise.all([
    loadConsumption(),
    loadHistory(),
    loadNeeds()
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
    const row = createItemRow(item, map, history);
    container.appendChild(row);
  });
  await saveConsumption(Array.from(map.values()));
}

document.addEventListener('DOMContentLoaded', init);

import { loadJSON } from './utils/dataLoader.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const NEEDS_KEY = 'yearlyNeeds';

function loadNeeds() {
  return new Promise(async resolve => {
    try {
      chrome.storage.local.get(NEEDS_KEY, async data => {
        if (data[NEEDS_KEY]) {
          resolve(data[NEEDS_KEY]);
        } else {
          const arr = await loadJSON(NEEDS_PATH);
          resolve(arr);
        }
      });
    } catch (e) {
      const arr = await loadJSON(NEEDS_PATH);
      resolve(arr);
    }
  });
}

function saveNeeds(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [NEEDS_KEY]: arr }, () => resolve());
  });
}

function createRow(item, needs) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = item.name;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Category';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (!val) return;
      const rec = needs.find(n => n.name === item.name);
      if (rec) {
        rec.category = val;
        await saveNeeds(needs);
        div.remove();
      }
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);
  return div;
}

async function init() {
  const container = document.getElementById('items');
  const needs = await loadNeeds();
  const missing = needs.filter(n => !n.category);
  missing.forEach(item => container.appendChild(createRow(item, needs)));
}

document.addEventListener('DOMContentLoaded', init);

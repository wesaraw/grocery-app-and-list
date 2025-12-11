import { loadJSON } from './utils/dataLoader.js';
import {
  sortItemsByCategory,
  renderItemsWithCategoryHeaders
} from './utils/sortByCategory.js';
import { WEEKS_PER_MONTH } from './utils/constants.js';
import {
  loadArray as loadItemArray,
  convertArrayToNames,
  saveArray as saveItemArray,
  getItemName
} from './utils/itemStorage.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
const EXPIRATION_PATH = 'Required for grocery app/expiration_times_full.json';

let filterText = '';
const headerState = {};
let allNeeds = [];
let container;

async function loadArray(key, path) {
  const arr = await loadItemArray(key);
  if (arr.length > 0) return arr;
  const fromJson = await loadJSON(path);
  return await convertArrayToNames(fromJson);
}

const loadNeeds = () => loadArray('yearlyNeeds', NEEDS_PATH);
const loadExpiration = () => loadArray('expirationData', EXPIRATION_PATH);

function saveExpiration(arr) {
  return saveItemArray('expirationData', arr);
}

function weeksFromMonths(months) {
  return months * WEEKS_PER_MONTH;
}

function monthsFromWeeks(weeks) {
  return weeks / WEEKS_PER_MONTH;
}

function createRow(item, expMap, expArr) {
  const div = document.createElement('div');
  div.className = 'expiration-item';
  const span = document.createElement('span');
  const rec = expMap.get(item.name);
  const weeks = rec ? weeksFromMonths(rec.shelf_life_months) : 52;
  span.textContent = `${item.name} - ${weeks.toFixed(1)} w`;
  div.appendChild(span);

  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = 'Weeks';
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        let record = expMap.get(item.name);
        if (!record) {
          record = { name: item.name, shelf_life_months: monthsFromWeeks(val) };
          expArr.push(record);
          expMap.set(item.name, record);
        } else {
          record.shelf_life_months = monthsFromWeeks(val);
        }
        span.textContent = `${item.name} - ${val.toFixed(1)} w`;
        input.value = '';
        await saveExpiration(expArr);
      }
    }
  });
  div.appendChild(document.createTextNode(' '));
  div.appendChild(input);

  return div;
}

function getWeeksForItem(name, expMap) {
  const rec = expMap.get(name);
  return rec ? weeksFromMonths(rec.shelf_life_months) : 52;
}

function escapeXmlAttr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildExportXml(items, expMap) {
  const categoryItems = new Map();

  items.forEach(item => {
    const category = item.category || 'Other';
    if (!categoryItems.has(category)) {
      categoryItems.set(category, []);
    }
    categoryItems.get(category).push(item);
  });

  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<expirationList>'];

  categoryItems.forEach((catItems, category) => {
    lines.push('', `    <category name="${escapeXmlAttr(category)}">`);
    catItems.forEach(item => {
      const weeks = getWeeksForItem(item.name, expMap).toFixed(1);
      lines.push(
        `        <item name="${escapeXmlAttr(item.name)}" weeks="${weeks}"/>`
      );
    });
    lines.push('    </category>');
  });

  lines.push('', '</expirationList>');
  return lines.join('\n');
}

function downloadXml(xmlText) {
  const blob = new Blob([xmlText], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'expiration_times.xml';
  a.click();
  URL.revokeObjectURL(url);
}

async function parseImportXml(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid XML');
  }

  const items = [];
  const nodes = Array.from(doc.getElementsByTagName('item'));
  for (const node of nodes) {
    const rawName = (node.getAttribute('name') || '').trim();
    const id = (node.getAttribute('id') || '').trim();
    const weeks = parseFloat((node.getAttribute('weeks') || node.textContent || '').trim());
    if (Number.isNaN(weeks)) continue;
    let name = rawName;
    if (!name && id) {
      name = (await getItemName(id))?.trim();
    }
    if (!name) continue;
    items.push({ name, weeks });
  }

  return items;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function applyImportedExpirations(imported, expArr, expMap, needs) {
  if (!Array.isArray(imported) || imported.length === 0) return 0;
  const nameLookup = new Map(needs.map(n => [n.name.toLowerCase(), n.name]));
  let applied = 0;

  imported.forEach(entry => {
    const normalizedName = nameLookup.get(entry.name.toLowerCase()) || entry.name;
    if (!normalizedName || Number.isNaN(entry.weeks)) return;
    let record = expMap.get(normalizedName);
    if (!record) {
      record = { name: normalizedName, shelf_life_months: monthsFromWeeks(entry.weeks) };
      expArr.push(record);
      expMap.set(normalizedName, record);
    } else {
      record.shelf_life_months = monthsFromWeeks(entry.weeks);
    }
    applied += 1;
  });

  await saveExpiration(expArr);
  return applied;
}

async function init() {
  container = document.getElementById('expirations');
  const [needs, expiration] = await Promise.all([loadNeeds(), loadExpiration()]);
  allNeeds = sortItemsByCategory(needs);
  const expMap = new Map(expiration.map(e => [e.name, e]));

  function render() {
    container.innerHTML = '';
    const arr = filterText
      ? allNeeds.filter(n => n.name.toLowerCase().includes(filterText))
      : allNeeds;
    renderItemsWithCategoryHeaders(
      arr,
      container,
      n => createRow(n, expMap, expiration),
      headerState
    );
  }

  render();

  document.getElementById('searchBox').addEventListener('input', () => {
    filterText = document.getElementById('searchBox').value.trim().toLowerCase();
    render();
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const xml = buildExportXml(allNeeds, expMap);
    downloadXml(xml);
  });

  const importInput = document.getElementById('importFile');
  document.getElementById('importBtn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const imported = await parseImportXml(text);
      const applied = await applyImportedExpirations(imported, expiration, expMap, allNeeds);
      render();
      alert(`Applied ${applied} expiration update${applied === 1 ? '' : 's'}.`);
    } catch (err) {
      alert('Unable to import XML file. Please verify the format and try again.');
    } finally {
      importInput.value = '';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

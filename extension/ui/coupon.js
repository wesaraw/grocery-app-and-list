import { get as storageGet, set as storageSet } from '../storageService.js';
import { renderItemsWithCategoryHeaders } from './components.js';

const STORES = ['Stop & Shop', 'Walmart', 'Amazon', 'Shaws', 'Roche Bros', 'Hannaford'];

let items = [];
let coupons = [];
const headerState = {};

async function saveCoupons() {
  await storageSet('coupons', coupons);
}

function createList(item) {
  const ul = document.createElement('ul');
  function refresh() {
    ul.innerHTML = '';
    coupons.forEach((c, idx) => {
      if (c.itemId !== item.id) return;
      const li = document.createElement('li');
      const store = c.store || 'ALL';
      li.textContent = `${c.type} ${c.value} w${c.startWeek}-${c.endWeek} (${store})`;
      const del = document.createElement('button');
      del.textContent = 'X';
      del.addEventListener('click', async () => {
        coupons.splice(idx, 1);
        await saveCoupons();
        refresh();
      });
      li.appendChild(document.createTextNode(' '));
      li.appendChild(del);
      ul.appendChild(li);
    });
  }
  refresh();
  return { ul, refresh };
}

function createRow(item) {
  const div = document.createElement('div');
  div.className = 'item';
  const span = document.createElement('span');
  span.textContent = item.name;
  div.appendChild(span);
  div.appendChild(document.createElement('br'));

  const pct = document.createElement('input');
  pct.type = 'number';
  pct.placeholder = '% off';

  const off = document.createElement('input');
  off.type = 'number';
  off.placeholder = '$ off';

  const fixed = document.createElement('input');
  fixed.type = 'number';
  fixed.placeholder = 'Cost';

  const start = document.createElement('input');
  start.type = 'number';
  start.placeholder = 'Start';
  start.min = 1;
  start.max = 52;
  start.className = 'week-input';

  const end = document.createElement('input');
  end.type = 'number';
  end.placeholder = 'End';
  end.min = 1;
  end.max = 52;
  end.className = 'week-input';

  const storeSelect = document.createElement('select');
  ['ALL', ...STORES].forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    storeSelect.appendChild(opt);
  });

  const btn = document.createElement('button');
  btn.textContent = 'Submit';

  const { ul, refresh } = createList(item);

  btn.addEventListener('click', async () => {
    const pVal = parseFloat(pct.value);
    const oVal = parseFloat(off.value);
    const fVal = parseFloat(fixed.value);
    const sWeek = parseInt(start.value, 10);
    const eWeek = parseInt(end.value, 10);
    if (isNaN(sWeek) || isNaN(eWeek)) return;
    let type = null;
    let value = null;
    if (!isNaN(pVal)) {
      type = 'percent';
      value = pVal;
    } else if (!isNaN(oVal)) {
      type = 'fixedOff';
      value = oVal;
    } else if (!isNaN(fVal)) {
      type = 'fixedPrice';
      value = fVal;
    } else {
      return;
    }
    const store = storeSelect.value || 'ALL';
    coupons.push({ itemId: item.id, type, value, startWeek: sWeek, endWeek: eWeek, store, version: 1 });
    await saveCoupons();
    pct.value = '';
    off.value = '';
    fixed.value = '';
    start.value = '';
    end.value = '';
    storeSelect.value = 'ALL';
    refresh();
  });

  div.append(pct, document.createTextNode(' '), off, document.createTextNode(' '), fixed, document.createTextNode(' '), start, document.createTextNode(' '), end, document.createTextNode(' '), storeSelect, document.createTextNode(' '), btn, ul);
  return div;
}

function render(list) {
  const container = document.getElementById('coupons');
  renderItemsWithCategoryHeaders(container, list, (parent, item) => {
    parent.appendChild(createRow(item));
  }, headerState);
}

function applyFilter() {
  const term = document.getElementById('searchBox').value.toLowerCase();
  const list = term ? items.filter(i => i.name.toLowerCase().includes(term)) : items;
  render(list);
}

async function init() {
  items = await storageGet('items');
  coupons = await storageGet('coupons');
  applyFilter();
  document.getElementById('searchBox').addEventListener('input', applyFilter);
}

init();


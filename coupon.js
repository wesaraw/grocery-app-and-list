import { loadJSON } from './utils/dataLoader.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

function loadNeeds() {
  return new Promise(async resolve => {
    chrome.storage.local.get('yearlyNeeds', async data => {
      if (data.yearlyNeeds) {
        resolve(data.yearlyNeeds);
      } else {
        const needs = await loadJSON(NEEDS_PATH);
        resolve(needs);
      }
    });
  });
}

function loadCoupons() {
  return new Promise(resolve => {
    chrome.storage.local.get('coupons', data => {
      resolve(data.coupons || {});
    });
  });
}

function saveCoupons(map) {
  return new Promise(resolve => {
    chrome.storage.local.set({ coupons: map }, () => resolve());
  });
}

const STORES = ['Stop & Shop', 'Walmart', 'Amazon', 'Shaws', 'Roche Bros', 'Hannaford'];

function createList(itemName, couponsMap) {
  const ul = document.createElement('ul');
  function refresh() {
    ul.innerHTML = '';
    (couponsMap[itemName] || []).forEach((c, idx) => {
      const li = document.createElement('li');
      const store = c.store || 'ALL';
      li.textContent = `${c.type} ${c.value} w${c.startWeek}-${c.endWeek} (${store})`;
      const del = document.createElement('button');
      del.textContent = 'X';
      del.addEventListener('click', async () => {
        couponsMap[itemName].splice(idx, 1);
        if (couponsMap[itemName].length === 0) delete couponsMap[itemName];
        await saveCoupons(couponsMap);
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

function createRow(item, couponsMap) {
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
  start.className = 'week';

  const end = document.createElement('input');
  end.type = 'number';
  end.placeholder = 'End';
  end.min = 1;
  end.max = 52;
  end.className = 'week';

  const storeSelect = document.createElement('select');
  ['ALL', ...STORES].forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    storeSelect.appendChild(opt);
  });

  const btn = document.createElement('button');
  btn.textContent = 'Submit';

  const { ul, refresh } = createList(item.name, couponsMap);

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
    if (!couponsMap[item.name]) couponsMap[item.name] = [];
    couponsMap[item.name].push({
      type,
      value,
      startWeek: sWeek,
      endWeek: eWeek,
      store
    });
    await saveCoupons(couponsMap);
    pct.value = '';
    off.value = '';
    fixed.value = '';
    start.value = '';
    end.value = '';
    storeSelect.value = 'ALL';
    refresh();
  });

  div.appendChild(pct);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(off);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(fixed);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(start);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(end);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(storeSelect);
  div.appendChild(document.createTextNode(' '));
  div.appendChild(btn);
  div.appendChild(ul);
  return div;
}

async function init() {
  const container = document.getElementById('coupons');
  const [needs, coupons] = await Promise.all([loadNeeds(), loadCoupons()]);
  needs.forEach(n => {
    const row = createRow(n, coupons);
    container.appendChild(row);
  });
  await saveCoupons(coupons);
}

document.addEventListener('DOMContentLoaded', init);

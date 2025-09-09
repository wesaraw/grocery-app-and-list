import { get as storageGet, set as storageSet } from '../services/storageService.js';
import { calculatePackUnits } from '../utils/pack.js';

const WEEKS_PER_MONTH = 4.33;

const openWindows = {};
function openOrFocusWindow(path, width = 400, height = 600) {
  const [base] = path.split('?');
  const existing = openWindows[base];
  if (existing && !existing.closed) {
    existing.location.href = path;
    existing.focus();
    return;
  }
  openWindows[base] = window.open(path, base, `width=${width},height=${height}`);
}

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

function computeWeeklyNeed(item) {
  const plan = item.consumptionPlan || {};
  if (typeof plan.monthly === 'number') return plan.monthly / WEEKS_PER_MONTH;
  if (typeof plan.yearly === 'number') return plan.yearly / 52;
  return 0;
}

function simulateItem(item, overrides = {}) {
  const incoming = [];
  const stockByWeek = item.currentStockByWeek || {};
  const shelf = item.shelfLifeWeeks || 0;
  Object.entries(stockByWeek).forEach(([wStr, qty]) => {
    const week = parseInt(wStr, 10);
    if (!Number.isFinite(week)) return;
    incoming.push({ start: week, qty: Number(qty), exp: week + shelf });
  });
  incoming.sort((a, b) => a.start - b.start);
  const active = [];
  const weeks = [];
  const weeklyNeed = computeWeeklyNeed(item);
  for (let w = 1; w <= 52; w++) {
    while (incoming.length && incoming[0].start <= w) {
      active.push(incoming.shift());
    }
    active.sort((a, b) => a.exp - b.exp);
    while (active.length && w >= active[0].exp) {
      active.shift();
    }
    const qtyBefore = active.reduce((s, b) => s + b.qty, 0);
    const closestExp = active.length ? Math.min(...active.map(b => b.exp)) : w;
    const weeksToExpiration = closestExp - w;
    let cls = 'green';
    if (qtyBefore <= 0 || weeksToExpiration <= 0) cls = 'red';
    else if (qtyBefore < weeklyNeed * 2 || weeksToExpiration < shelf * 0.1) cls = 'yellow';
    weeks.push({
      qty: qtyBefore.toFixed(1),
      weeksToExpiration: Math.floor(weeksToExpiration),
      cls
    });
    const cons = (overrides[w] !== undefined ? overrides[w] : 1) * weeklyNeed;
    let remaining = cons;
    while (active.length && remaining > 0) {
      if (active[0].qty > remaining) {
        active[0].qty -= remaining;
        remaining = 0;
      } else {
        remaining -= active[0].qty;
        active.shift();
      }
    }
  }
  return weeks;
}

function sortItemsByCategory(items) {
  return items.slice().sort((a, b) => {
    const catA = (a.category || '').toLowerCase();
    const catB = (b.category || '').toLowerCase();
    if (catA === catB) return a.name.localeCompare(b.name);
    return catA.localeCompare(catB);
  });
}

function buildGrid(items, headerState = {}, startWeek = 1) {
  const sorted = sortItemsByCategory(items);
  const grid = document.createElement('table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  const imgHead = document.createElement('th');
  imgHead.className = 'item-image image-header';
  header.appendChild(imgHead);
  const firstTh = document.createElement('th');
  firstTh.textContent = 'Item';
  firstTh.className = 'item-label';
  header.appendChild(firstTh);
  for (let w = startWeek; w <= 52; w++) {
    const th = document.createElement('th');
    th.textContent = w;
    header.appendChild(th);
  }
  thead.appendChild(header);
  grid.appendChild(thead);
  const tbody = document.createElement('tbody');

  let lastCat = null;
  let headerRow = null;
  let itemRows = [];

  function finalizeHeader(cat, row, rows) {
    if (!row) return;
    const hidden = headerState[cat] !== undefined ? headerState[cat] : true;
    row.dataset.hidden = hidden ? 'true' : 'false';
    rows.forEach(r => {
      r.style.display = hidden ? 'none' : '';
    });
    const cells = row.querySelectorAll('.category-header, .category-spacer');
    cells.forEach(cell => {
      cell.style.cursor = 'pointer';
      const associatedRows = rows.slice();
      cell.addEventListener('click', () => {
        const isHidden = row.dataset.hidden === 'true';
        row.dataset.hidden = isHidden ? 'false' : 'true';
        associatedRows.forEach(r => {
          r.style.display = isHidden ? '' : 'none';
        });
        headerState[cat] = !isHidden;
      });
    });
  }

  sorted.forEach(item => {
    const cat = item.category || 'Other';
    if (cat !== lastCat) {
      finalizeHeader(lastCat, headerRow, itemRows);
      lastCat = cat;
      headerRow = document.createElement('tr');
      const thImg = document.createElement('th');
      thImg.className = 'category-header item-image';
      headerRow.appendChild(thImg);
      const thCat = document.createElement('th');
      thCat.className = 'category-header item-label';
      thCat.textContent = cat;
      headerRow.appendChild(thCat);
      const thFill = document.createElement('th');
      thFill.colSpan = 52 - startWeek + 1;
      thFill.className = 'category-spacer';
      headerRow.appendChild(thFill);
      tbody.appendChild(headerRow);
      itemRows = [];
    }
    const weeks = simulateItem(item);
    const row = document.createElement('tr');
    const imgTd = document.createElement('td');
    imgTd.className = 'item-image';
    if (item.image) {
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.name;
      imgTd.appendChild(img);
    }
    row.appendChild(imgTd);
    const th = document.createElement('th');
    th.className = 'item-label';
    th.dataset.name = item.name.toLowerCase();
    const weekly = computeWeeklyNeed(item);
    let total = Object.values(item.currentStockByWeek || {}).reduce(
      (s, v) => s + v,
      0
    );
    th.innerHTML = `${item.name}<br/><span class="exp-weeks">${
      item.shelfLifeWeeks || 0
    }w</span>` +
      `<br/><span class="weekly-cons">${weekly.toFixed(2)}/wk</span>` +
      `<br/><span class="current-total">${total.toFixed(2)} ${item.uom}</span>`;
    const weeklySpan = th.querySelector('.weekly-cons');
    if (weeklySpan) {
      weeklySpan.style.cursor = 'pointer';
      weeklySpan.addEventListener('click', () => {
        const params = new URLSearchParams({
          item: item.name,
          weekly,
          wpm: WEEKS_PER_MONTH
        });
        openOrFocusWindow(`weeklyNeedDebug.html?${params.toString()}`, 320, 240);
      });
    }
    const qtySpan = th.querySelector('.current-total');

    const setInput = document.createElement('input');
    setInput.type = 'number';
    setInput.placeholder = 'Set total';
    setInput.className = 'stock-input';
    async function commitChange() {
      const val = parseFloat(setInput.value);
      if (isNaN(val)) return;
      const diff = val - total;
      if (diff !== 0) {
        item.purchases = Array.isArray(item.purchases) ? item.purchases : [];
        const week = getCurrentWeek();
        item.purchases.push({
          purchase_week: week,
          quantity_purchased: diff,
          date_added: new Date().toISOString()
        });
        item.currentStockByWeek = item.currentStockByWeek || {};
        item.currentStockByWeek[week] =
          (item.currentStockByWeek[week] || 0) + diff;
        await storageSet('items', items);
        total = val;
        qtySpan.textContent = `${total.toFixed(2)} ${item.uom}`;
      }
      setInput.value = '';
    }
    setInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') commitChange();
    });
    setInput.addEventListener('blur', commitChange);

    const packInput = document.createElement('input');
    packInput.type = 'number';
    packInput.placeholder = 'Pack qty';
    packInput.className = 'pack-input';
    const product = item.options?.selected;
    async function commitPack() {
      const val = parseFloat(packInput.value);
      if (isNaN(val) || !product) return;
      const newTotal = calculatePackUnits(item, product, val);
      if (newTotal == null) return;
      const diff = newTotal - total;
      if (diff !== 0) {
        item.purchases = Array.isArray(item.purchases) ? item.purchases : [];
        const week = getCurrentWeek();
        item.purchases.push({
          purchase_week: week,
          quantity_purchased: diff,
          date_added: new Date().toISOString()
        });
        item.currentStockByWeek = item.currentStockByWeek || {};
        item.currentStockByWeek[week] =
          (item.currentStockByWeek[week] || 0) + diff;
        await storageSet('items', items);
        total = newTotal;
        qtySpan.textContent = `${total.toFixed(2)} ${item.uom}`;
      }
      packInput.value = '';
    }
    packInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') commitPack();
    });
    packInput.addEventListener('blur', commitPack);

    th.appendChild(document.createElement('br'));
    th.appendChild(setInput);
    th.appendChild(document.createTextNode(' '));
    th.appendChild(packInput);
    row.appendChild(th);
    weeks.forEach((w, idx) => {
      const weekNum = idx + 1;
      if (weekNum < startWeek) return;
      const td = document.createElement('td');
      td.className = w.cls;
      td.innerHTML = `${w.qty}<br/>⏰ ${w.weeksToExpiration}`;
      row.appendChild(td);
    });
    tbody.appendChild(row);
    itemRows.push(row);
  });
  finalizeHeader(lastCat, headerRow, itemRows);
  grid.appendChild(tbody);
  return grid;
}

const headerState = {};
let currentOnly = false;
let showHistory = false;
let hideZeroItems = false;

function getStartWeek() {
  if (currentOnly) return getCurrentWeek();
  const val = parseInt(document.getElementById('week-number').value, 10);
  return Number.isFinite(val) ? val : 1;
}

async function render() {
  const items = await storageGet('items');
  const filtered = (items || []).filter(
    item => !(hideZeroItems && computeWeeklyNeed(item) <= 0)
  );
  const sorted = sortItemsByCategory(filtered);
  const list = document.getElementById('item-list');
  if (list) {
    list.innerHTML = '';
    sorted.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.name;
      list.appendChild(opt);
    });
  }
  const startWeek = getStartWeek();
  const grid = buildGrid(filtered, headerState, startWeek);
  const container = document.getElementById('inventory');
  container.innerHTML = '';
  container.appendChild(grid);
  // apply existing filter after rebuilding the grid
  filterGrid(document.getElementById('searchBox').value);
}

async function renderHistory() {
  const items = await storageGet('items');
  const container = document.getElementById('inventory');
  container.innerHTML = '';
  (items || []).forEach(item => {
    const purchases = Array.isArray(item.purchases) ? item.purchases : [];
    if (purchases.length === 0) return;
    const header = document.createElement('h3');
    header.textContent = item.name;
    container.appendChild(header);
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Week</th><th>Qty</th><th>Date</th><th></th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    purchases.forEach((p, idx) => {
      const tr = document.createElement('tr');
      const weekTd = document.createElement('td');
      weekTd.textContent = p.purchase_week;
      tr.appendChild(weekTd);
      const qtyTd = document.createElement('td');
      qtyTd.textContent = p.quantity_purchased;
      tr.appendChild(qtyTd);
      const dateTd = document.createElement('td');
      dateTd.textContent = new Date(p.date_added).toLocaleDateString();
      tr.appendChild(dateTd);
      const delTd = document.createElement('td');
      const btn = document.createElement('button');
      btn.textContent = 'Delete';
      btn.addEventListener('click', () => deletePurchase(item.id, idx));
      delTd.appendChild(btn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  });
}

function filterGrid(value) {
  const term = (value || '').toLowerCase();
  const tbody = document.querySelector('#inventory tbody');
  if (!tbody) return;
  let headerRow = null;
  let matchCount = 0;
  Array.from(tbody.rows).forEach(row => {
    if (row.querySelector('.category-header')) {
      if (headerRow) {
        headerRow.style.display = matchCount > 0 ? '' : 'none';
      }
      headerRow = row;
      matchCount = 0;
      return;
    }
    const label = row.querySelector('.item-label');
    const text = label?.dataset.name || '';
    const matches = text.includes(term);
    if (matches) matchCount++;
    const catHidden = headerRow?.dataset.hidden === 'true';
    row.style.display = matches && !catHidden ? '' : 'none';
  });
  if (headerRow) {
    headerRow.style.display = matchCount > 0 ? '' : 'none';
  }
}

async function addPurchase() {
  const nameEl = document.getElementById('purchase-item');
  const weekEl = document.getElementById('purchase-week');
  const qtyEl = document.getElementById('purchase-qty');
  const name = nameEl.value.trim();
  const week = parseInt(weekEl.value, 10);
  const qty = parseFloat(qtyEl.value);
  if (!name || !Number.isFinite(week) || week < 1 || week > 52 || !Number.isFinite(qty) || qty <= 0)
    return;
  const items = await storageGet('items');
  const item = (items || []).find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return;
  item.purchases = Array.isArray(item.purchases) ? item.purchases : [];
  item.purchases.push({
    purchase_week: week,
    quantity_purchased: qty,
    date_added: new Date().toISOString()
  });
  item.currentStockByWeek = item.currentStockByWeek || {};
  item.currentStockByWeek[week] = (item.currentStockByWeek[week] || 0) + qty;
  await storageSet('items', items);
  if (showHistory) renderHistory();
  else render();
  nameEl.value = '';
  weekEl.value = '';
  qtyEl.value = '';
}

document.getElementById('searchBox').addEventListener('input', e => {
  filterGrid(e.target.value);
});
document.getElementById('week-number').addEventListener('change', render);
document.getElementById('add-purchase').addEventListener('click', addPurchase);
document.getElementById('toggleZero').addEventListener('click', () => {
  hideZeroItems = !hideZeroItems;
  const btn = document.getElementById('toggleZero');
  btn.textContent = hideZeroItems ? 'Show Zero Qty' : 'Hide Zero Qty';
  render();
});
document.getElementById('toggle-history').addEventListener('click', () => {
  showHistory = !showHistory;
  document.getElementById('toggle-history').textContent = showHistory
    ? 'Back to Inventory'
    : 'Purchase History';
  if (showHistory) renderHistory();
  else render();
});
document.getElementById('usersPage').addEventListener('click', () => {
  openOrFocusWindow('users.html');
});
document.getElementById('cookingDaysPage').addEventListener('click', () => {
  openOrFocusWindow('cooking-days.html');
});
document.getElementById('timelinePage').addEventListener('click', () => {
  openOrFocusWindow('inventoryTimeline.html');
});
document.getElementById('mealListPage').addEventListener('click', () => {
  openOrFocusWindow('mealList.html');
});
document.getElementById('addItem').addEventListener('click', () => {
  openOrFocusWindow('addItem.html');
});
document.getElementById('removeItem').addEventListener('click', () => {
  openOrFocusWindow('removeItem.html');
});
document.getElementById('renameItem').addEventListener('click', () => {
  openOrFocusWindow('renameItem.html');
});
document.getElementById('uomChange').addEventListener('click', () => {
  openOrFocusWindow('uomChange.html');
});
document.getElementById('densityRatios').addEventListener('click', () => {
  openOrFocusWindow('densityRatios.html');
});
document.getElementById('editCategory').addEventListener('click', () => {
  openOrFocusWindow('editCategory.html');
});
document.getElementById('editExpiration').addEventListener('click', () => {
  openOrFocusWindow('expiration.html');
});
document.getElementById('editSeason').addEventListener('click', () => {
  openOrFocusWindow('editSeason.html');
});
document.getElementById('backupPage').addEventListener('click', () => {
  openOrFocusWindow('backup.html');
});

async function deletePurchase(itemId, idx) {
  const items = await storageGet('items');
  const item = (items || []).find(i => i.id === itemId);
  if (!item || !Array.isArray(item.purchases) || !item.purchases[idx]) return;
  const { purchase_week, quantity_purchased } = item.purchases[idx];
  item.purchases.splice(idx, 1);
  if (item.currentStockByWeek && item.currentStockByWeek[purchase_week] !== undefined) {
    item.currentStockByWeek[purchase_week] -= quantity_purchased;
    if (item.currentStockByWeek[purchase_week] <= 0) delete item.currentStockByWeek[purchase_week];
  }
  await storageSet('items', items);
  if (showHistory) renderHistory();
  else render();
}

const currentBtn = document.createElement('button');
currentBtn.id = 'current-view';
currentBtn.textContent = 'Current View';
document.body.insertBefore(currentBtn, document.getElementById('inventory'));
currentBtn.addEventListener('click', () => {
  currentOnly = !currentOnly;
  currentBtn.textContent = currentOnly ? 'Full Year' : 'Current View';
  render();
});

render();

async function loadJSON(path) {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  return res.json();
}

async function loadPurchases() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('purchases', data => {
        resolve(data.purchases || {});
      });
    } catch (e) {
      // fallback if chrome is not available
      resolve({});
    }
  });
}

async function loadOverrides() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('consumptionOverrides', data => {
        resolve(data.consumptionOverrides || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

async function savePurchases(map) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ purchases: map }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

function loadArray(key, path) {
  return new Promise(async resolve => {
    try {
      chrome.storage.local.get(key, async data => {
        if (data[key]) {
          resolve(data[key]);
        } else {
          const arr = await loadJSON(path);
          resolve(arr);
        }
      });
    } catch (e) {
      const arr = await loadJSON(path);
      resolve(arr);
    }
  });
}

async function loadData() {
  const [needs, expiration, stock] = await Promise.all([
    loadArray('yearlyNeeds', 'Required for grocery app/yearly_needs_with_manual_flags.json'),
    loadArray('expirationData', 'Required for grocery app/expiration_times_full.json'),
    loadArray('currentStock', 'Required for grocery app/current_stock_table.json')
  ]);
  return { needs, expiration, stock };
}

function buildItemMap(needs, expiration, stock) {
  const expMap = {};
  expiration.forEach(e => { expMap[e.name] = e.shelf_life_months * 4.33; });
  const stockMap = {};
  stock.forEach(s => { stockMap[s.name] = s.amount; });

  return needs.map(n => ({
    name: n.name,
    units_per_purchase: 1,
    weekly_consumption: n.total_needed_year / 52,
    expiration_weeks: expMap[n.name] || 52,
    starting_stock: stockMap[n.name] || 0,
    purchases: []
  }));
}

function simulateItem(item, overrides) {
  const incoming = [];
  const active = [];
  // initial stock treated as purchase at week 1
  if (item.starting_stock > 0) {
    incoming.push({ start: 1, qty: item.starting_stock, exp: 1 + item.expiration_weeks });
  }
  item.purchases.forEach(p => {
    const exp = p.manual_expiration_override || item.expiration_weeks;
    incoming.push({ start: p.purchase_week, qty: p.quantity_purchased, exp: p.purchase_week + exp });
  });
  incoming.sort((a,b)=>a.start-b.start);

  const weeks = [];
  let runoutWeek = null;
  for (let w=1; w<=52; w++) {
    // move incoming purchases into active inventory
    while (incoming.length && incoming[0].start <= w) {
      active.push(incoming.shift());
    }
    // sort by soonest expiration for processing
    active.sort((a,b)=>a.exp-b.exp);
    // remove expired batches
    while (active.length && w >= active[0].exp) {
      active.shift();
    }
    let qty = active.reduce((sum,b)=>sum+b.qty,0);
    const cons = (overrides[w]!==undefined ? overrides[w] : 1) * item.weekly_consumption;
    let remaining = cons;
    while (active.length && remaining>0) {
      if (active[0].qty > remaining) {
        active[0].qty -= remaining;
        remaining = 0;
      } else {
        remaining -= active[0].qty;
        active.shift();
      }
    }
    qty = active.reduce((sum,b)=>sum+b.qty,0);
    const closestExp = active.length ? Math.min(...active.map(b=>b.exp)) : w;
    const weeksToExpiration = closestExp - w;
    const weeksToRunout = qty > 0 ? qty / item.weekly_consumption : 0;
    if (qty <= 0 && runoutWeek===null) runoutWeek = w;
    let cls = 'green';
    if (qty <= 0 || weeksToExpiration <= 0) {
      cls = 'red';
    } else if (qty < item.weekly_consumption*2 || weeksToExpiration < item.expiration_weeks*0.1) {
      cls = 'yellow';
    }
    weeks.push({ qty: qty.toFixed(1), weeksToExpiration: Math.floor(weeksToExpiration), cls });
  }
  return weeks;
}

function buildGrid(items) {
  const grid = document.createElement('table');
  const header = document.createElement('tr');
  const firstTh = document.createElement('th');
  firstTh.textContent = 'Item';
  header.appendChild(firstTh);
  for (let w=1; w<=52; w++) {
    const th = document.createElement('th');
    th.textContent = w;
    header.appendChild(th);
  }
  grid.appendChild(header);

  items.forEach(item => {
    const overrides = {};
    if (item.overrideWeeks) Object.assign(overrides, item.overrideWeeks);
    const weeks = simulateItem(item, overrides);
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.innerHTML = `${item.name}<br/><span class="exp-weeks">${item.expiration_weeks}w</span>`;
    row.appendChild(th);
    weeks.forEach(w => {
      const td = document.createElement('td');
      td.className = w.cls;
      td.innerHTML = `${w.qty}<br/>⏰ ${w.weeksToExpiration}`;
      row.appendChild(td);
    });
    grid.appendChild(row);
  });
  return grid;
}

function buildPurchaseList(items) {
  const container = document.createElement('div');
  items.forEach(item => {
    if (!item.purchases.length) return;
    const header = document.createElement('h3');
    header.textContent = item.name;
    container.appendChild(header);
    const ul = document.createElement('ul');
    item.purchases.forEach((p, idx) => {
      const li = document.createElement('li');
      const date = new Date(p.date_added).toLocaleDateString();
      li.textContent = `Week ${p.purchase_week} - Qty ${p.quantity_purchased} - ${date} `;
      const btn = document.createElement('button');
      btn.textContent = 'X';
      btn.addEventListener('click', () => {
        item.purchases.splice(idx, 1);
        saveAllPurchases(items);
        showPurchaseHistory();
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    container.appendChild(ul);
  });
  return container;
}

function saveAllPurchases(items) {
  const map = {};
  items.forEach(it => { if (it.purchases.length) map[it.name] = it.purchases; });
  savePurchases(map);
}

let showingHistory = false;
let globalItems = [];
let gridContainer;

async function fetchItems() {
  const data = await loadData();
  const items = buildItemMap(data.needs, data.expiration, data.stock);
  const [savedMap, overridesMap] = await Promise.all([
    loadPurchases(),
    loadOverrides()
  ]);
  items.forEach(it => {
    if (savedMap[it.name]) {
      it.purchases = savedMap[it.name];
    }
    const data = overridesMap[it.name] || {};
    const weekMap = {};
    Object.keys(data).forEach(w => {
      const diff = data[w];
      weekMap[w] = it.weekly_consumption
        ? 1 + diff / it.weekly_consumption
        : 1;
    });
    it.overrideWeeks = weekMap;
  });
  return items;
}

async function refreshItems() {
  globalItems = await fetchItems();
  const datalist = document.getElementById('item-list');
  if (datalist) {
    datalist.innerHTML = '';
    globalItems.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.name;
      datalist.appendChild(opt);
    });
  }
  if (showingHistory) {
    showPurchaseHistory();
  } else {
    showGrid();
  }
}

function resizeWindowToContent() {
  try {
    const width = Math.min(
      screen.availWidth,
      document.documentElement.scrollWidth + 20
    );
    const height = Math.min(
      screen.availHeight,
      document.documentElement.scrollHeight + 20
    );
    chrome.windows.getCurrent(win => {
      chrome.windows.update(win.id, { width, height });
    });
  } catch (e) {
    // ignore if chrome APIs are unavailable
  }
}

function showGrid() {
  showingHistory = false;
  document.getElementById('view-purchases').textContent = 'Purchase History';
  gridContainer.innerHTML = '';
  gridContainer.appendChild(buildGrid(globalItems));
  resizeWindowToContent();
}

function showPurchaseHistory() {
  showingHistory = true;
  document.getElementById('view-purchases').textContent = 'Timeline View';
  gridContainer.innerHTML = '';
  gridContainer.appendChild(buildPurchaseList(globalItems));
  resizeWindowToContent();
}

async function init() {
  gridContainer = document.getElementById('grid-container');
  await refreshItems();

  document.getElementById('view-purchases').addEventListener('click', () => {
    if (showingHistory) {
      showGrid();
    } else {
      showPurchaseHistory();
    }
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;

    if (changes.yearlyNeeds || changes.expirationData || changes.currentStock) {
      await refreshItems();
      return;
    }

    let updated = false;
    if (changes.purchases) {
      const map = changes.purchases.newValue || {};
      globalItems.forEach(it => {
        it.purchases = map[it.name] || [];
      });
      updated = true;
    }
    if (changes.consumptionOverrides || changes.consumedThisYear) {
      const overridesMap = await loadOverrides();
      globalItems.forEach(it => {
        const data = overridesMap[it.name] || {};
        const weekMap = {};
        Object.keys(data).forEach(w => {
          const diff = data[w];
          weekMap[w] = it.weekly_consumption
            ? 1 + diff / it.weekly_consumption
            : 1;
        });
        it.overrideWeeks = weekMap;
      });
      updated = true;
    }
    if (updated) {
      if (showingHistory) {
        showPurchaseHistory();
      } else {
        showGrid();
      }
    }
  });

  try {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg && msg.type === 'inventory-updated') {
        if (showingHistory) {
          showPurchaseHistory();
        } else {
          showGrid();
        }
      }
    });
  } catch (_) {}

  document.getElementById('add-purchase').addEventListener('click', () => {
    const name = document.getElementById('purchase-item').value;
    const week = parseInt(document.getElementById('purchase-week').value,10);
    const qty = parseFloat(document.getElementById('purchase-qty').value);
    const item = globalItems.find(i => i.name===name);
    if (!item) return;
    item.purchases.push({ purchase_week: week, quantity_purchased: qty, date_added: new Date().toISOString() });
    saveAllPurchases(globalItems);
    if (showingHistory) {
      showPurchaseHistory();
    } else {
      showGrid();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

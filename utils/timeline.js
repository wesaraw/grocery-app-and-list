export function getStockForWeek(items, purchases = {}, week = 1) {
  return items.map(item => {
    const simItem = {
      ...item,
      purchases: purchases[item.name] || []
    };
    const qty = simulateForWeek(simItem, week);
    return { name: item.name, amount: qty };
  });
}

export function getStockBeforeWeek(items, purchases = {}, week = 1) {
  return items.map(item => {
    const simItem = {
      ...item,
      purchases: purchases[item.name] || []
    };
    const qty = simulateBeforeWeek(simItem, week);
    return { name: item.name, amount: qty };
  });
}

function simulateForWeek(item, week) {
  const incoming = [];
  const active = [];
  if (item.starting_stock > 0) {
    incoming.push({ start: 1, qty: item.starting_stock, exp: 1 + item.expiration_weeks });
  }
  (item.purchases || []).forEach(p => {
    const exp = p.manual_expiration_override || item.expiration_weeks;
    incoming.push({ start: p.purchase_week, qty: p.quantity_purchased, exp: p.purchase_week + exp });
  });
  incoming.sort((a,b)=>a.start-b.start);

  for (let w = 1; w <= week; w++) {
    while (incoming.length && incoming[0].start <= w) {
      active.push(incoming.shift());
    }
    active.sort((a,b)=>a.exp-b.exp);
    while (active.length && w >= active[0].exp) {
      active.shift();
    }
    let remaining = item.weekly_consumption;
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
  return active.reduce((sum,b)=>sum+b.qty,0);
}

function simulateBeforeWeek(item, week) {
  const incoming = [];
  const active = [];
  if (item.starting_stock > 0) {
    incoming.push({ start: 1, qty: item.starting_stock, exp: 1 + item.expiration_weeks });
  }
  (item.purchases || []).forEach(p => {
    const exp = p.manual_expiration_override || item.expiration_weeks;
    incoming.push({ start: p.purchase_week, qty: p.quantity_purchased, exp: p.purchase_week + exp });
  });
  incoming.sort((a, b) => a.start - b.start);

  for (let w = 1; w < week; w++) {
    while (incoming.length && incoming[0].start <= w) {
      active.push(incoming.shift());
    }
    active.sort((a, b) => a.exp - b.exp);
    while (active.length && w >= active[0].exp) {
      active.shift();
    }
    let remaining = item.weekly_consumption;
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

  const w = week;
  while (incoming.length && incoming[0].start <= w) {
    active.push(incoming.shift());
  }
  active.sort((a, b) => a.exp - b.exp);
  while (active.length && w >= active[0].exp) {
    active.shift();
  }

  return active.reduce((sum, b) => sum + b.qty, 0);
}

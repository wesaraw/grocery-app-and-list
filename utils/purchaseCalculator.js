import { WEEKS_PER_MONTH } from './constants.js';
import {
  parseQuantity,
  weekNumber,
  buildMealMap,
  aggregateCalendar
} from './calendarUtils.js';


function sumRange(arr, start, end) {
  let total = 0;
  for (let i = start; i < end && i < arr.length; i++) {
    total += arr[i] || 0;
  }
  return total;
}

function simulateBeforeWeekVar(item, weeklyArr, week) {
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
    let remaining = weeklyArr[w] || 0;
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

export function calculatePurchaseNeeds(
  needs,
  consumption,
  stock,
  expiration,
  consumedYear = [],
  mealYear = [],
  purchases = {},
  week = 1,
  calendar = {},
  mealsByCategory = {},
  useMealPlanTotals = true
) {
  const consMap = new Map(consumption.map(i => [i.name, i]));
  const expMap = new Map(expiration.map(i => [i.name, i]));

  const mealMap = useMealPlanTotals
    ? new Map(mealYear.map(m => [m.name, m.total_needed_year]))
    : new Map();
  const mergedNeeds = needs.map(n => ({
    ...n,
    total_needed_year: (n.total_needed_year || 0) + (mealMap.get(n.name) || 0)
  }));

  const needsMap = new Map(needs.map(n => [n.name, n.home_unit]));
  const calendarNeeds = aggregateCalendar(calendar, mealsByCategory, needsMap);

  const weeklyNeedMap = new Map();
  mergedNeeds.forEach(item => {
    const baseWeekly =
      (consMap.get(item.name)?.monthly_consumption ?? 0) / WEEKS_PER_MONTH;
    const arr = Array(53).fill(baseWeekly);
    const mealArr = calendarNeeds.get(item.name);
    if (mealArr) {
      mealArr.forEach((v, idx) => {
        arr[idx] = (arr[idx] || 0) + v;
      });
    }
    weeklyNeedMap.set(item.name, arr);
  });

  const timelineItems = mergedNeeds.map(item => ({
    name: item.name,
    weekly_consumption: weeklyNeedMap.get(item.name)[week] || 0,
    expiration_weeks:
      (expMap.get(item.name)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH,
    starting_stock: stock.find(s => s.name === item.name)?.amount ?? 0,
    purchases: purchases[item.name] || []
  }));

  const stockMap = new Map();
  timelineItems.forEach(t => {
    const qty = simulateBeforeWeekVar(t, weeklyNeedMap.get(t.name), week);
    stockMap.set(t.name, qty);
  });

  const weeksRemaining = 52 - week + 1;

  const futurePurchasesMap = new Map();
  Object.keys(purchases).forEach(name => {
    const total = purchases[name]
      .filter(p => p.purchase_week >= week)
      .reduce((sum, p) => sum + (p.quantity_purchased || 0), 0);
    futurePurchasesMap.set(name, total);
  });

  const purchasesWithinMap = new Map();
  mergedNeeds.forEach(item => {
    const expWeeks =
      (expMap.get(item.name)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH;
    const horizon = week + Math.ceil(expWeeks);
    const list = purchases[item.name] || [];
    const total = list
      .filter(p => p.purchase_week >= week && p.purchase_week < horizon)
      .reduce((sum, p) => sum + (p.quantity_purchased || 0), 0);
    purchasesWithinMap.set(item.name, total);
  });

  return mergedNeeds.map(item => {
    const weeklyArr = weeklyNeedMap.get(item.name);
    const required = sumRange(weeklyArr, week, 53);

    const onHand =
      (stockMap.get(item.name) || 0) + (futurePurchasesMap.get(item.name) || 0);

    // calculate gating amount based on expiration

    const expWeeks =
      (expMap.get(item.name)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH;
    const horizon = week + Math.ceil(expWeeks);

    const horizonStock = simulateBeforeWeekVar(
      timelineItems.find(t => t.name === item.name),
      weeklyArr,
      horizon
    );

    const purchasesWithin = purchasesWithinMap.get(item.name) || 0;
    const currentQty = stockMap.get(item.name) || 0;
    const consumedExisting = currentQty + purchasesWithin - horizonStock;
    const capacity = sumRange(weeklyArr, week, horizon);
    let toBuyExpiration = capacity - consumedExisting;
    if (toBuyExpiration < 0) toBuyExpiration = 0;

    let toBuy = Math.min(required - onHand, toBuyExpiration);
    if (item.treat_as_whole_unit) {
      toBuy = Math.ceil(toBuy);
    }
    return {
      name: item.name,
      toBuy: toBuy > 0 ? toBuy : 0,
      home_unit: item.home_unit
    };
  });
}

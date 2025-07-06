import { WEEKS_PER_MONTH } from './constants.js';
import { convert } from './uomConverter.js';

function parseQuantity(str) {
  if (!str) return { value: 0, unit: null };
  const m = str.trim().match(/^([\d.]+(?:\/\d+)?)\s*([a-zA-Z]+)?/);
  if (!m) return { value: 0, unit: null };
  let numStr = m[1];
  let value;
  const frac = numStr.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    value = !isNaN(num) && !isNaN(den) && den !== 0 ? num / den : 0;
  } else {
    value = parseFloat(numStr);
  }
  if (isNaN(value)) value = 0;
  const unit = m[2] ? m[2].toLowerCase() : null;
  return { value, unit };
}

function weekNumber(dateStr) {
  const date = new Date(dateStr);
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7);
}

function buildMealMap(mealsByCategory) {
  const map = new Map();
  Object.values(mealsByCategory || {}).forEach(list => {
    if (!Array.isArray(list)) return;
    list.forEach(m => {
      if (!m) return;
      map.set(m.id || m.name, m);
    });
  });
  return map;
}

function aggregateCalendar(calendar = {}, mealsByCategory = {}, needsMap = new Map()) {
  const mealMap = buildMealMap(mealsByCategory);
  const result = new Map();
  Object.values(calendar).forEach(days => {
    Object.entries(days || {}).forEach(([dateStr, rec]) => {
      const week = weekNumber(dateStr);
      Object.values(rec || {}).forEach(val => {
        const meals = Array.isArray(val) ? val : [val];
        meals.forEach(id => {
          const meal = mealMap.get(id);
          if (!meal) return;
          const mult = meal.people ?? meal.multiplier ?? 1;
          (meal.ingredients || []).forEach(ing => {
            const { value, unit } = parseQuantity(ing.serving_size || ing.amount);
            if (!value) return;
            let qty = value;
            const target = needsMap.get(ing.name);
            if (unit && target && unit !== target) {
              qty = convert(value, unit, target);
            }
            let arr = result.get(ing.name);
            if (!arr) {
              arr = Array(53).fill(0);
              result.set(ing.name, arr);
            }
            arr[week] += qty * mult;
          });
        });
      });
    });
  });
  return result; // Map of ingredient -> weekly qty array
}

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

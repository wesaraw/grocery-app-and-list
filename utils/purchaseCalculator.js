import { WEEKS_PER_MONTH } from './constants.js';
import {
  parseQuantity,
  weekNumber,
  buildMealMap,
  aggregateCalendar
} from './calendarUtils.js';
import { loadDensityMap } from './unitNormalize.js';
import { loadUsers, loadUserPortionMultipliers } from './userData.js';
import { canonicalName } from './nameUtils.js';
import { getItemNameMap } from './itemStorage.js';


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

const MAX_WEEKS = 53;

export async function calculatePurchaseNeeds(
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
  useMealPlanTotals = true,
  densityMap = {},
  startDate = null,
  endDate = null
) {
  let nameIdMap = {};
  try {
    nameIdMap = (await getItemNameMap()) || {};
  } catch (_err) {
    nameIdMap = {};
  }
  const idNameMap = {};
  Object.entries(nameIdMap).forEach(([name, id]) => {
    if (id != null) {
      idNameMap[String(id)] = name;
    }
  });
  const resolveStoredName = raw => {
    if (raw == null) return '';
    const str = String(raw).trim();
    if (!str) return '';
    return idNameMap[str] || str;
  };
  const normalizedName = raw => {
    const resolved = resolveStoredName(raw);
    return resolved || '';
  };
  const canonicalKey = name => canonicalName(resolveStoredName(name));

  const needsUnitMap = new Map();
  const needsByCanonical = new Map();
  needs.forEach(n => {
    const displayName = normalizedName(n?.name);
    const key = canonicalKey(n?.name);
    if (!key) {
      return;
    }
    const existing = needsByCanonical.get(key);
    if (existing) {
      existing.base_total_needed_year =
        (existing.base_total_needed_year || 0) + (n.total_needed_year || 0);
      if (existing.home_unit == null && n.home_unit != null) {
        existing.home_unit = n.home_unit;
      }
      if (n.treat_as_whole_unit) {
        existing.treat_as_whole_unit = true;
      }
    } else {
      needsByCanonical.set(key, {
        ...n,
        name: displayName || n.name,
        canonical: key,
        base_total_needed_year: n.total_needed_year || 0
      });
    }
    if (!needsUnitMap.has(key) && n.home_unit != null) {
      needsUnitMap.set(key, n.home_unit);
    }
  });

  const needsUnitLookup = {
    get(name) {
      return needsUnitMap.get(canonicalKey(name));
    }
  };

  const stockUnitMap = new Map();
  stock.forEach(entry => {
    const key = canonicalKey(entry.name);
    if (!key) return;
    if (entry.unit) {
      stockUnitMap.set(key, entry.unit);
    }
  });

  const consMap = new Map();
  consumption.forEach(item => {
    const key = canonicalKey(item.name);
    if (!key) return;
    const monthly = Number(item.monthly_consumption) || 0;
    consMap.set(key, (consMap.get(key) || 0) + monthly);
  });

  const expMap = new Map();
  expiration.forEach(item => {
    const key = canonicalKey(item?.name);
    if (!key) return;
    if (!expMap.has(key)) {
      expMap.set(key, { ...item, name: normalizedName(item?.name) || item?.name });
    }
  });

  const mealMap = new Map();
  if (useMealPlanTotals) {
    mealYear.forEach(m => {
    const key = canonicalKey(m?.name);
      if (!key) return;
      const total = Number(m.total_needed_year) || 0;
      mealMap.set(key, (mealMap.get(key) || 0) + total);
    });
  }

  let mergedNeeds = Array.from(needsByCanonical.values()).map(item => ({
    ...item,
    total_needed_year:
      (item.base_total_needed_year || 0) + (mealMap.get(item.canonical) || 0)
  }));

  let users = [];
  let rawMultipliers = [];
  try {
    [users, rawMultipliers] = await Promise.all([
      loadUsers(),
      loadUserPortionMultipliers()
    ]);
  } catch (_err) {
    users = [];
    rawMultipliers = [];
  }
  const multiplierMap = new Map();
  const userIndexLookup = new Map();
  if (Array.isArray(users)) {
    users.forEach((user, idx) => {
      const val = Array.isArray(rawMultipliers) ? rawMultipliers[idx] : undefined;
      const numeric = typeof val === 'number' && Number.isFinite(val) ? val : 1;
      multiplierMap.set(user, numeric);
      userIndexLookup.set(user, idx);
    });
  }
  const calendarNeeds = aggregateCalendar(
    calendar,
    mealsByCategory,
    needsUnitLookup,
    densityMap,
    true,
    multiplierMap,
    userIndexLookup,
    startDate,
    endDate
  );

  const rawEndWeekNumber = typeof endDate === 'string' ? weekNumber(endDate) : Number.NaN;
  const normalizedEndWeek =
    Number.isFinite(rawEndWeekNumber) && rawEndWeekNumber > 0
      ? Math.floor(rawEndWeekNumber)
      : null;
  const cappedEndWeek =
    normalizedEndWeek != null
      ? Math.max(Math.min(normalizedEndWeek, MAX_WEEKS - 1), week - 1)
      : null;
  const exclusiveEndWeek =
    cappedEndWeek != null ? Math.max(week, cappedEndWeek + 1) : MAX_WEEKS;

  const canonicalCalendarNeeds = new Map();
  const calendarDisplayNameMap = new Map();
  calendarNeeds.forEach((arr, name) => {
    const key = canonicalKey(name);
    if (!key) return;
    const displayName = normalizedName(name) || name;
    if (!calendarDisplayNameMap.has(key)) {
      calendarDisplayNameMap.set(key, displayName);
    }
    const existing = canonicalCalendarNeeds.get(key);
    if (existing) {
      (Array.isArray(arr) ? arr : []).forEach((value, idx) => {
        if (value) {
          existing[idx] = (existing[idx] || 0) + value;
        }
      });
    } else {
      canonicalCalendarNeeds.set(key, Array.isArray(arr) ? arr.slice() : []);
    }
  });

  calendarDisplayNameMap.forEach((displayName, key) => {
    if (needsByCanonical.has(key)) return;
    const homeUnit = needsUnitMap.get(key) || stockUnitMap.get(key) || 'each';
    needsByCanonical.set(key, {
      name: displayName,
      canonical: key,
      home_unit: homeUnit,
      base_total_needed_year: 0,
      total_needed_year: 0
    });
    if (!needsUnitMap.has(key) && homeUnit != null) {
      needsUnitMap.set(key, homeUnit);
    }
  });

  mergedNeeds = Array.from(needsByCanonical.values()).map(item => ({
    ...item,
    total_needed_year:
      (item.base_total_needed_year || 0) + (mealMap.get(item.canonical) || 0)
  }));

  const weeklyNeedMap = new Map();
  const weeklyUseMap = new Map();
  const scheduledMealNeedMap = new Map();
  mergedNeeds.forEach(item => {
    const monthlyFromConsumption = consMap.get(item.canonical) || 0;
    const monthlyFromMealPlan = (mealMap.get(item.canonical) || 0) / 12;
    const monthlyTotal = monthlyFromConsumption + monthlyFromMealPlan;
    let baseWeekly = monthlyTotal / WEEKS_PER_MONTH;
    if (!baseWeekly && item.total_needed_year) {
      baseWeekly = (item.total_needed_year || 0) / 52;
    }
    const recurringArr = Array(MAX_WEEKS).fill(baseWeekly);
    const scheduledArr = Array(MAX_WEEKS).fill(0);

    const mealArr = canonicalCalendarNeeds.get(item.canonical);
    const expirationWeeks =
      (expMap.get(item.canonical)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH;

    if (Array.isArray(mealArr)) {
      mealArr.forEach((v, idx) => {
        if (!v) return;
        const mealWeek = idx;
        if (mealWeek - expirationWeeks <= week && idx < scheduledArr.length) {
          scheduledArr[idx] = (scheduledArr[idx] || 0) + v;
        }
      });
    }

    const combinedArr = recurringArr.map((val, idx) => val + (scheduledArr[idx] || 0));

    weeklyNeedMap.set(item.canonical, combinedArr);
    weeklyUseMap.set(item.canonical, recurringArr);
    scheduledMealNeedMap.set(item.canonical, scheduledArr);
  });

  const stockQuantityMap = new Map();
  stock.forEach(entry => {
    const key = canonicalKey(entry.name);
    if (!key) return;
    const amount = Number(entry.amount) || 0;
    stockQuantityMap.set(key, (stockQuantityMap.get(key) || 0) + amount);
  });

  const purchasesByCanonical = new Map();
  Object.entries(purchases || {}).forEach(([name, list]) => {
    const key = canonicalKey(name);
    if (!key || !Array.isArray(list)) return;
    const existing = purchasesByCanonical.get(key) || [];
    list.forEach(p => existing.push(p));
    purchasesByCanonical.set(key, existing);
  });

  const timelineItems = mergedNeeds.map(item => ({
    name: item.canonical,
    weekly_consumption: weeklyNeedMap.get(item.canonical)?.[week] || 0,
    expiration_weeks:
      (expMap.get(item.canonical)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH,
    starting_stock: stockQuantityMap.get(item.canonical) || 0,
    purchases: purchasesByCanonical.get(item.canonical) || []
  }));

  const timelineLookup = new Map();
  const stockMap = new Map();
  timelineItems.forEach(t => {
    timelineLookup.set(t.name, t);
    const weeklyArr = weeklyNeedMap.get(t.name) || Array(MAX_WEEKS).fill(0);
    const qty = simulateBeforeWeekVar(t, weeklyArr, week);
    stockMap.set(t.name, qty);
  });

  const futurePurchasesMap = new Map();
  purchasesByCanonical.forEach((list, name) => {
    const total = list
      .filter(p =>
        p.purchase_week >= week &&
        (cappedEndWeek == null || p.purchase_week <= cappedEndWeek)
      )
      .reduce((sum, p) => sum + (p.quantity_purchased || 0), 0);
    futurePurchasesMap.set(name, total);
  });

  const purchasesWithinMap = new Map();
  mergedNeeds.forEach(item => {
    const expWeeks =
      (expMap.get(item.canonical)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH;
    const horizonExclusive =
      cappedEndWeek != null
        ? Math.max(week, Math.min(week + Math.ceil(expWeeks), exclusiveEndWeek))
        : week + Math.ceil(expWeeks);
    const list = purchasesByCanonical.get(item.canonical) || [];
    const total = list
      .filter(p => p.purchase_week >= week && p.purchase_week < horizonExclusive)
      .reduce((sum, p) => sum + (p.quantity_purchased || 0), 0);
    purchasesWithinMap.set(item.canonical, total);
  });

  return mergedNeeds.map(item => {
    const weeklyArr = weeklyNeedMap.get(item.canonical) || Array(MAX_WEEKS).fill(0);
    const weeklyUseArr = weeklyUseMap.get(item.canonical) || Array(MAX_WEEKS).fill(0);
    const scheduledMealArr =
      scheduledMealNeedMap.get(item.canonical) || Array(MAX_WEEKS).fill(0);
    const arrExclusiveEnd = Math.min(exclusiveEndWeek, weeklyArr.length);
    const required =
      sumRange(weeklyUseArr, week, arrExclusiveEnd) +
      sumRange(scheduledMealArr, week, arrExclusiveEnd);

    const onHand =
      (stockMap.get(item.canonical) || 0) +
      (futurePurchasesMap.get(item.canonical) || 0);

    const expWeeks =
      (expMap.get(item.canonical)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH;
    const baseHorizonExclusive = week + Math.ceil(expWeeks);
    const cappedHorizonExclusive =
      cappedEndWeek != null
        ? Math.max(week, Math.min(baseHorizonExclusive, exclusiveEndWeek))
        : baseHorizonExclusive;

    const horizonWeekForSim = Math.max(
      week,
      Math.min(cappedHorizonExclusive, weeklyArr.length)
    );

    const horizonStock = simulateBeforeWeekVar(
      timelineLookup.get(item.canonical),
      weeklyArr,
      horizonWeekForSim
    );

    const purchasesWithin = purchasesWithinMap.get(item.canonical) || 0;
    const currentQty = stockMap.get(item.canonical) || 0;
    const consumedExisting = currentQty + purchasesWithin - horizonStock;
    const capacity =
      sumRange(weeklyUseArr, week, Math.min(cappedHorizonExclusive, weeklyArr.length)) +
      sumRange(
        scheduledMealArr,
        week,
        Math.min(cappedHorizonExclusive, weeklyArr.length)
      );
    let toBuyExpiration = capacity - consumedExisting;
    if (toBuyExpiration < 0) toBuyExpiration = 0;

    let toBuy = Math.min(required - onHand, toBuyExpiration);
    if (item.treat_as_whole_unit) {
      toBuy = Math.ceil(toBuy);
    }
    return {
      name: item.name,
      toBuy: toBuy > 0 ? toBuy : 0,
      home_unit: item.home_unit,
      weeklyUse: weeklyUseArr,
      requiredForScheduledMeals: scheduledMealArr
    };
  });
}

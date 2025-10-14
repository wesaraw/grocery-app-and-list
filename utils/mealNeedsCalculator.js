import {
  MEAL_TYPES,
  DEFAULT_MEALS_PER_DAY,
  loadMealsPerDay,
  initializeMealCategories,
  loadCookingDays
} from './mealData.js';
import {
  generatePreparedMealsCalendar
} from './preparedMealsCalendar.js';
import {
  generateWhatToEatCalendar,
  buildAllowedMealLookup,
  filterCalendarDayByAllowedMeals
} from './whatToEatCalendar.js';
import { loadJSON } from './dataLoader.js';
import { initUomTable, convert } from './uomConverter.js';
import { loadDensityMap, convertWithDensity } from './unitNormalize.js';
import {
  loadUsers,
  loadUserCategoryDays,
  loadUserPriceThresholds,
  loadUserPortionMultipliers
} from './userData.js';
import { loadItemSeasons } from './seasonData.js';
import {
  loadMealSlotOverrides,
  MEAL_SLOT_OVERRIDE_DAYS
} from './mealSlotOverrides.js';

import { loadWeeklyMealOverrides, groupWeeklyOverridesByDateAndUser } from './weeklyMealOverrides.js';

const YEARLY_NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';

function parseQuantity(str) {
  if (!str) return { value: 0, unit: null };
  const text = str.trim().toLowerCase();
  if (/^(?:just\s+a\s+)?pinch(?:\b|\s|$)/i.test(text)) {
    return { value: 1 / 16, unit: 'tsp' };
  }
  const m = text.match(/^([\d.]+(?:\/\d+)?)\s*([a-zA-Z-]+)?/);
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
  let unit = m[2] ? m[2].toLowerCase() : null;
  if (!unit) unit = 'ea';
  return { value, unit };
}

function loadMeals(type) {
  const { key, path } = MEAL_TYPES[type];
  return new Promise(async resolve => {
    chrome.storage.local.get(key, async data => {
      let arr = data[key];
      if (!arr) {
        arr = await loadJSON(path);
      }
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (m.prepared === undefined) m.prepared = false;
          if (m.leftoverOk === undefined) m.leftoverOk = false;
          if (m.weight === undefined) m.weight = 1;
          if (m.groupMeal === undefined) m.groupMeal = false;
        });
      }
      resolve(arr || []);
    });
  });
}

export async function calculateAndSaveMealNeeds(options = {}) {
  await initializeMealCategories();
  await initUomTable();
  const densityMap = await loadDensityMap();
  const needsList = await loadJSON(YEARLY_NEEDS_PATH).catch(() => []);
  const unitMap = new Map(needsList.map(n => [n.name, n.home_unit]));
  const monthlyMap = {};
  const monthlyBreakdown = {};
  const mealsPerDay = await loadMealsPerDay();
  const users = await loadUsers();
  const userDays = await loadUserCategoryDays();
  const rawMultipliers = await loadUserPortionMultipliers();
  const priceThresholds = await loadUserPriceThresholds();
  const itemSeasons = await loadItemSeasons();
  const overrides = await loadMealSlotOverrides();

  const weeklyOverrideEntries = await loadWeeklyMealOverrides();
  const weeklyOverridesByDate = groupWeeklyOverridesByDateAndUser(
    weeklyOverrideEntries,
    users
  );

  while (userDays.length < users.length) userDays.push({});

  const userMultipliers = users.map((_, idx) => {
    const val = Array.isArray(rawMultipliers) ? rawMultipliers[idx] : undefined;
    return typeof val === 'number' && Number.isFinite(val) ? val : 1;
  });

  function resolveMealMultiplier(meal, userIndex) {
    const base = userMultipliers[userIndex] ?? 1;
    if (!meal || !Array.isArray(meal.userPortionOverrides)) {
      return base;
    }
    const override = meal.userPortionOverrides[userIndex];
    return typeof override === 'number' && Number.isFinite(override) ? override : base;
  }

  const labelToCategory = {};
  Object.entries(MEAL_TYPES).forEach(([id, info]) => {
    if (info && info.label) {
      labelToCategory[info.label] = id;
    }
  });

  const validDayOrder = new Map(
    MEAL_SLOT_OVERRIDE_DAYS.map((day, idx) => [day, idx])
  );
  const validDaySet = new Set(MEAL_SLOT_OVERRIDE_DAYS);

  function sortDays(list) {
    return Array.from(new Set(list.filter(day => validDaySet.has(day))))
      .sort((a, b) => (validDayOrder.get(a) || 0) - (validDayOrder.get(b) || 0));
  }

  function normalizeCategoryPreference(value) {
    let rawSlots = [];
    let rawPrepSlots = [];
    if (value && typeof value === 'object') {
      if (Array.isArray(value.slots)) {
        rawSlots = value.slots.map(slot => (Array.isArray(slot) ? slot.slice() : []));
        if (Array.isArray(value.prepSlots)) {
          rawPrepSlots = value.prepSlots.map(prep => (Array.isArray(prep) ? prep.slice() : []));
        } else if (Array.isArray(value.prepDays)) {
          const prepDays = value.prepDays.slice();
          rawPrepSlots = rawSlots.map(() => prepDays.slice());
        }
      } else if (Array.isArray(value.slotDays)) {
        rawSlots = value.slotDays.map(slot => (Array.isArray(slot) ? slot.slice() : []));
        if (Array.isArray(value.prepSlots)) {
          rawPrepSlots = value.prepSlots.map(prep => (Array.isArray(prep) ? prep.slice() : []));
        } else if (Array.isArray(value.prepDays)) {
          const prepDays = value.prepDays.slice();
          rawPrepSlots = rawSlots.map(() => prepDays.slice());
        }
      }
    }
    if (!rawSlots.length) {
      if (Array.isArray(value)) {
        rawSlots = [value.slice()];
      } else if (value && typeof value === 'object' && Array.isArray(value.days)) {
        rawSlots = [value.days.slice()];
        if (Array.isArray(value.prepDays)) {
          rawPrepSlots = [value.prepDays.slice()];
        }
      } else {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) {
          const count = Math.min(MEAL_SLOT_OVERRIDE_DAYS.length, Math.round(numeric));
          if (count > 0) {
            rawSlots = [MEAL_SLOT_OVERRIDE_DAYS.slice(0, count)];
          }
        }
      }
    }
    const slots = rawSlots.map(slot => sortDays(Array.isArray(slot) ? slot : []));
    const slotSets = slots.map(slot => new Set(slot));
    const prepSlots = slots.map((slot, idx) => {
      const slotSet = slotSets[idx];
      const rawPrep = Array.isArray(rawPrepSlots[idx]) ? rawPrepSlots[idx] : [];
      const normalizedPrep = sortDays(Array.isArray(rawPrep) ? rawPrep : []);
      return normalizedPrep.filter(day => slotSet.has(day));
    });
    const prepSlotSets = prepSlots.map(prep => new Set(prep));
    const unionSet = new Set();
    slots.forEach(slot => {
      slot.forEach(day => unionSet.add(day));
    });
    const union = sortDays(Array.from(unionSet));
    const prepUnionSet = new Set();
    prepSlots.forEach(prep => {
      prep.forEach(day => {
        if (unionSet.has(day)) {
          prepUnionSet.add(day);
        }
      });
    });
    const prepUnion = sortDays(Array.from(prepUnionSet));
    return { slots, slotSets, union, unionSet, prepSlots, prepSlotSets, prepUnion, prepUnionSet };
  }

  const perDayCache = {};
  function getSlotsPerDay(categoryId) {
    if (perDayCache[categoryId] !== undefined) {
      return perDayCache[categoryId];
    }
    const raw = mealsPerDay[categoryId];
    let value;
    if (typeof raw === 'number') {
      value = raw;
    } else if (raw !== undefined && raw !== null) {
      const parsed = Number(raw);
      value = Number.isFinite(parsed) ? parsed : undefined;
    }
    if (value === undefined) {
      value = DEFAULT_MEALS_PER_DAY[categoryId];
    }
    if (!Number.isFinite(value)) {
      value = 0;
    }
    perDayCache[categoryId] = value;
    return value;
  }

  const userCategoryDayLists = users.map(() => ({}));
  userDays.forEach((rec, idx) => {
    const map = userCategoryDayLists[idx];
    Object.entries(rec || {}).forEach(([label, pref]) => {
      let categoryId = labelToCategory[label];
      if (!categoryId && MEAL_TYPES[label]) {
        categoryId = label;
      }
      if (!categoryId) return;
      const normalized = normalizeCategoryPreference(pref);
      map[categoryId] = normalized;
    });
  });

  const slotOverridesByUserIndex = {};
  overrides.forEach(override => {
    if (!override || typeof override !== 'object') return;
    const userIndex = override.userIndex;
    if (!Number.isInteger(userIndex) || userIndex < 0 || userIndex >= users.length) {
      return;
    }
    const days = Array.isArray(override.days) ? override.days : [];
    if (!days.length) return;
    const source = override.sourceCategoryId;
    const target = override.overrideCategoryId;
    if (!source || !target) return;
    const slotIndex = override.slotIndex;
    if (!Number.isInteger(slotIndex)) return;
    const userMap = slotOverridesByUserIndex[userIndex] || (slotOverridesByUserIndex[userIndex] = {});
    days.forEach(day => {
      if (!validDaySet.has(day)) return;
      const dayMap = userMap[day] || (userMap[day] = {});
      const catMap = dayMap[source] || (dayMap[source] = {});
      catMap[slotIndex] = target;
    });
  });

  const overrideSourceCounts = {};
  const overrideTargetCounts = {};
  const overrideSourceDaySets = {};
  const overrideTargetDaySets = {};
  Object.entries(slotOverridesByUserIndex).forEach(([idxStr, dayMap]) => {
    const idx = Number(idxStr);
    Object.entries(dayMap).forEach(([day, sourceMap]) => {
      Object.entries(sourceMap).forEach(([sourceCat, slotMap]) => {
        const slotIndices = Object.keys(slotMap);
        if (!slotIndices.length) return;
        const sourceCounts = overrideSourceCounts[idx] || (overrideSourceCounts[idx] = {});
        const sourceByDay = sourceCounts[sourceCat] || (sourceCounts[sourceCat] = {});
        sourceByDay[day] = (sourceByDay[day] || 0) + slotIndices.length;
        const sourceDaySets = overrideSourceDaySets[idx] || (overrideSourceDaySets[idx] = {});
        const srcSet = sourceDaySets[sourceCat] || (sourceDaySets[sourceCat] = new Set());
        srcSet.add(day);
        slotIndices.forEach(slotIdx => {
          const targetCat = slotMap[slotIdx];
          if (!targetCat) return;
          const targetCounts = overrideTargetCounts[idx] || (overrideTargetCounts[idx] = {});
          const targetByDay = targetCounts[targetCat] || (targetCounts[targetCat] = {});
          targetByDay[day] = (targetByDay[day] || 0) + 1;
          const targetDaySets = overrideTargetDaySets[idx] || (overrideTargetDaySets[idx] = {});
          const tgtSet = targetDaySets[targetCat] || (targetDaySets[targetCat] = new Set());
          tgtSet.add(day);
        });
      });
    });
  });

  function computeWeeklySlotsForUser(userIndex, categoryId) {
    const entry = userCategoryDayLists[userIndex]?.[categoryId];
    const slotSets = entry?.slotSets || [];
    const baseByDay = {};
    let baseSlots = 0;
    slotSets.forEach(slotSet => {
      slotSet.forEach(day => {
        baseByDay[day] = (baseByDay[day] || 0) + 1;
        baseSlots += 1;
      });
    });
    const sourceCounts = overrideSourceCounts[userIndex]?.[categoryId] || {};
    Object.entries(sourceCounts).forEach(([day, count]) => {
      if (!validDaySet.has(day)) return;
      const available = baseByDay[day] || 0;
      if (available <= 0) return;
      const reduction = Math.min(count, available);
      baseSlots -= reduction;
      baseByDay[day] = available - reduction;
    });
    const targetCounts = overrideTargetCounts[userIndex]?.[categoryId] || {};
    let additions = 0;
    Object.values(targetCounts).forEach(count => {
      additions += count;
    });
    const total = baseSlots + additions;
    return total > 0 ? total : 0;
  }

  const eatingDaySets = users.map((_, idx) => {
    const map = {};
    const categoryDays = userCategoryDayLists[idx] || {};
    Object.entries(categoryDays).forEach(([cat, info]) => {
      if (!info) return;
      map[cat] = new Set(info.union || []);
    });
    return map;
  });

  Object.entries(slotOverridesByUserIndex).forEach(([idxStr, dayMap]) => {
    const idx = Number(idxStr);
    const setMap = eatingDaySets[idx] || (eatingDaySets[idx] = {});
    Object.entries(dayMap).forEach(([day, sourceMap]) => {
      if (!validDaySet.has(day)) return;
      Object.entries(sourceMap).forEach(([sourceCat, slotMap]) => {
        const sourceSet = setMap[sourceCat] || (setMap[sourceCat] = new Set());
        sourceSet.add(day);
        Object.values(slotMap).forEach(targetCat => {
          if (!targetCat) return;
          const targetSet = setMap[targetCat] || (setMap[targetCat] = new Set());
          targetSet.add(day);
        });
      });
    });
  });

  const eatingDaysByUser = {};
  users.forEach((user, idx) => {
    const prefs = {};
    const sets = eatingDaySets[idx] || {};
    const slotMap = userCategoryDayLists[idx] || {};
    const categories = new Set([
      ...Object.keys(sets),
      ...Object.keys(slotMap)
    ]);
    categories.forEach(cat => {
      const daySet = sets[cat];
      const info = slotMap[cat];
      const days = daySet
        ? sortDays(Array.from(daySet))
        : info && Array.isArray(info.union)
        ? info.union.slice()
        : [];
      const slots = info?.slots ? info.slots.map(slot => slot.slice()) : [];
      const prepSlots = info?.prepSlots ? info.prepSlots.map(prep => prep.slice()) : [];
      const prepDays = info?.prepUnion ? info.prepUnion.slice() : [];
      if (days.length || slots.length || prepSlots.some(prep => prep.length)) {
        prefs[cat] = { days, slots, prepSlots, prepDays };
      }
    });
    eatingDaysByUser[user] = prefs;
  });

  const slotOverridesByUserName = {};
  Object.entries(slotOverridesByUserIndex).forEach(([idxStr, map]) => {
    const idx = Number(idxStr);
    const user = users[idx];
    if (!user) return;
    slotOverridesByUserName[user] = map;
  });

  for (const type of Object.keys(MEAL_TYPES)) {
    const label = MEAL_TYPES[type].label;
    const meals = await loadMeals(type);
    const active = meals.filter(m => {
      if (Array.isArray(m.users)) return m.users.some(Boolean);
      return (m.people ?? m.multiplier ?? 1) > 0;
    });
    if (!active.length) continue;
    const perDay = getSlotsPerDay(type);

    // Count how many meals each user has in this category
    const userMealCounts = users.map(() => 0);
    active.forEach(m => {
      if (!Array.isArray(m.users)) return;
      m.users.forEach((use, idx) => {
        if (use) userMealCounts[idx]++;
      });
    });

    active.forEach(meal => {
      const details = {
        perDay,
        activeMeals: active.length,
        factors: []
      };
      let monthlySpots = 0;

      if (Array.isArray(meal.users)) {
        meal.users.forEach((use, idx) => {
          if (!use) return;
          const slotsPerWeek = computeWeeklySlotsForUser(idx, type);
          const count = userMealCounts[idx] || 1;
          const unionCount = eatingDaySets[idx]?.[type]?.size || 0;
          const dayEquivalent =
            unionCount > 0 ? unionCount : perDay > 0 ? slotsPerWeek / perDay : slotsPerWeek;
          const multiplier = resolveMealMultiplier(meal, idx);
          details.factors.push({ people: multiplier, days: dayEquivalent });
          const normalizedCount = count > 0 ? count : 1;
          monthlySpots += (slotsPerWeek * multiplier * 52) / normalizedCount / 12;
        });
      } else {
        const people = meal.people ?? meal.multiplier ?? 1;
        if (people <= 0) return;
        const totalMultiplier = users.reduce(
          (sum, _user, idx) => sum + resolveMealMultiplier(meal, idx),
          0
        );
        let weightedSlotsSum = 0;
        users.forEach((_, idx) => {
          const multiplier = resolveMealMultiplier(meal, idx);
          const slotsPerWeek = computeWeeklySlotsForUser(idx, type);
          weightedSlotsSum += slotsPerWeek * multiplier;
        });
        if (totalMultiplier <= 0 || weightedSlotsSum <= 0) {
          return;
        }
        const slotsTotal = weightedSlotsSum / totalMultiplier;
        const unionCounts = users.map((_, idx) => eatingDaySets[idx]?.[type]?.size || 0);
        const averageUnion = unionCounts.length
          ? unionCounts.reduce((sum, val) => sum + val, 0) / unionCounts.length
          : 0;
        const dayEquivalent =
          averageUnion > 0
            ? averageUnion
            : perDay > 0
            ? slotsTotal / perDay
            : slotsTotal;
        details.factors.push({ people, days: dayEquivalent });
        monthlySpots =
          (weightedSlotsSum * people * 52) / totalMultiplier / active.length / 12;
      }

      if (monthlySpots <= 0) return;
      (meal.ingredients || []).forEach(ing => {
        const { value, unit } = parseQuantity(ing.serving_size || ing.amount);
        if (!value) return;
        let qty = value;
        const target = unitMap.get(ing.name);
        if (unit && target && unit !== target) {
          const info = densityMap[ing.name] || {};
          qty = convertWithDensity(value, unit, target, {
            convert_volume_to_weight: info.convert,
            custom_density_ratio: info.ratio
          });
        }
        const need = qty * monthlySpots;
        monthlyMap[ing.name] = (monthlyMap[ing.name] || 0) + need;
        if (!monthlyBreakdown[ing.name]) monthlyBreakdown[ing.name] = {};
        if (!monthlyBreakdown[ing.name][meal.name]) {
          monthlyBreakdown[ing.name][meal.name] = { amount: 0, details };
        }
        monthlyBreakdown[ing.name][meal.name].amount += need;
      });
    });
  }
  const yearlyMap = {};
  Object.keys(monthlyMap).forEach(name => {
    yearlyMap[name] = monthlyMap[name] * 12;
  });
  const monthlyArr = Object.entries(monthlyMap).map(([name, monthly_consumption]) => ({
    name,
    monthly_consumption
  }));
  const yearlyArr = Object.entries(yearlyMap).map(([name, total_needed_year]) => ({
    name,
    total_needed_year
  }));
  await new Promise(resolve => {
    chrome.storage.local.set(
      {
        mealPlanMonthly: monthlyArr,
        mealPlanYearly: yearlyArr,
        mealPlanMonthlyBreakdown: monthlyBreakdown
      },
      () => resolve()
    );
  });

  // build prepared and What To Eat calendars
  const cookingDays = await loadCookingDays();
  const dayCats = {};
  Object.keys(cookingDays).forEach(key => {
    if (MEAL_TYPES[key]) dayCats[key] = cookingDays[key];
  });
  const mealsByCategory = {};
  for (const type of Object.keys(MEAL_TYPES)) {
    mealsByCategory[type] = await loadMeals(type);
  }
  const startDate = new Date();
  const preparedCal = generatePreparedMealsCalendar(
    dayCats,
    mealsByCategory,
    startDate,
    4,
    itemSeasons
  );

  const subscriptions = {};
  users.forEach(u => (subscriptions[u] = {}));
  Object.entries(mealsByCategory).forEach(([cat, meals]) => {
    meals.forEach(meal => {
      if (!Array.isArray(meal.users)) return;
      meal.users.forEach((use, idx) => {
        if (!use) return;
        const user = users[idx];
        if (!subscriptions[user][cat]) subscriptions[user][cat] = [];
        subscriptions[user][cat].push(meal);
      });
    });
  });

  const allowedMealLookup = buildAllowedMealLookup(subscriptions);

  const eatingDays = {};
  Object.entries(eatingDaysByUser).forEach(([user, prefs]) => {
    eatingDays[user] = prefs;
  });

  const { whatToEatCalendar: prevCalendar, whatToEatCalendarMeta: prevMeta } = await new Promise(
    resolve => {
      chrome.storage.local.get(
        ['whatToEatCalendar', 'whatToEatCalendarMeta'],
        data => {
          resolve({
            whatToEatCalendar: data.whatToEatCalendar || {},
            whatToEatCalendarMeta: data.whatToEatCalendarMeta || null
          });
        }
      );
    }
  );

  const freezeBefore = new Date();
  const freezeBeforeStr = freezeBefore.toISOString().split('T')[0];
  const resync = !!(options && options.resync);

  const whatCalResult = generateWhatToEatCalendar(
    users,
    preparedCal,
    subscriptions,
    eatingDays,
    mealsPerDay,
    startDate,
    4,
    priceThresholds,
    itemSeasons,
    slotOverridesByUserName,
    weeklyOverridesByDate,
    {
      previousCalendar: resync ? {} : prevCalendar,
      freezeBefore: freezeBeforeStr,
      initialState: resync ? null : prevMeta || null
    }
  );

  let { calendar: whatCal, metadata: whatCalMeta } = whatCalResult;

  if (resync && prevCalendar && typeof prevCalendar === 'object') {
    const mergedCal = {};
    users.forEach(user => {
      const nextUserEntries = { ...(whatCal[user] || {}) };
      const prevUserEntries = prevCalendar[user];
      const allowedForUser = allowedMealLookup[user] || null;
      if (prevUserEntries && typeof prevUserEntries === 'object') {
        Object.entries(prevUserEntries).forEach(([dateStr, dayValue]) => {
          if (!freezeBeforeStr || dateStr < freezeBeforeStr) {
            if (nextUserEntries[dateStr] === undefined) {
              const filteredDay = filterCalendarDayByAllowedMeals(
                dayValue,
                allowedForUser
              );
              if (filteredDay && Object.keys(filteredDay).length) {
                nextUserEntries[dateStr] = filteredDay;
              }
            }
          }
        });
      }
      mergedCal[user] = nextUserEntries;
    });

    Object.keys(prevCalendar).forEach(prevUser => {
      if (mergedCal[prevUser]) return;
      const prevUserEntries = prevCalendar[prevUser];
      const allowedForUser = allowedMealLookup[prevUser] || null;
      const mergedEntries = {};
      if (prevUserEntries && typeof prevUserEntries === 'object') {
        Object.entries(prevUserEntries).forEach(([dateStr, dayValue]) => {
          if (!freezeBeforeStr || dateStr < freezeBeforeStr) {
            const filteredDay = filterCalendarDayByAllowedMeals(
              dayValue,
              allowedForUser
            );
            if (filteredDay && Object.keys(filteredDay).length) {
              mergedEntries[dateStr] = filteredDay;
            }
          }
        });
      }
      mergedCal[prevUser] = mergedEntries;
    });

    whatCal = mergedCal;
  }

  await new Promise(resolve => {
    chrome.storage.local.set(
      {
        preparedMealsCalendar: preparedCal,
        whatToEatCalendar: whatCal,
        whatToEatCalendarMeta: whatCalMeta
      },
      () => resolve()
    );
  });
  return { monthlyArr, yearlyArr, monthlyBreakdown };
}

export function loadMealPlanData() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['mealPlanMonthly', 'mealPlanYearly', 'mealPlanMonthlyBreakdown'],
      data => {
        resolve({
          monthly: data.mealPlanMonthly || [],
          yearly: data.mealPlanYearly || [],
          breakdown: data.mealPlanMonthlyBreakdown || {}
        });
      }
    );
  });
}

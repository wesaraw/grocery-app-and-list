import { convert } from './uomConverter.js';
import { loadDensityMap, convertWithDensity } from './unitNormalize.js';

export function parseQuantity(str) {
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

export function weekNumber(dateStr) {
  const date = new Date(dateStr);
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7);
}

export function buildMealMap(mealsByCategory) {
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

export function aggregateCalendar(
  calendar = {},
  mealsByCategory = {},
  needsMap = new Map(),
  densityMap = {},
  perUser = false,
  userMultipliers = []
) {
  const mealMap = buildMealMap(mealsByCategory);
  const result = new Map();

  function resolveMultiplier(key) {
    if (userMultipliers == null) return 1;
    if (userMultipliers instanceof Map) {
      const val = userMultipliers.get(key);
      if (typeof val === 'number' && Number.isFinite(val)) return val;
    } else if (Array.isArray(userMultipliers)) {
      const idx = Number(key);
      if (Number.isInteger(idx)) {
        const val = userMultipliers[idx];
        if (typeof val === 'number' && Number.isFinite(val)) return val;
      }
    } else if (typeof userMultipliers === 'object') {
      const val = userMultipliers[key];
      if (typeof val === 'number' && Number.isFinite(val)) return val;
    }
    return 1;
  }

  Object.entries(calendar).forEach(([userKey, days]) => {
    const userMultiplier = resolveMultiplier(userKey);
    Object.entries(days || {}).forEach(([dateStr, rec]) => {
      const week = weekNumber(dateStr);
      Object.values(rec || {}).forEach(val => {
        const meals = Array.isArray(val) ? val : [val];
        meals.forEach(id => {
          const meal = mealMap.get(id);
          if (!meal) return;
          const mult = perUser ? meal.multiplier ?? 1 : meal.people ?? meal.multiplier ?? 1;
          (meal.ingredients || []).forEach(ing => {
            const { value, unit } = parseQuantity(ing.serving_size || ing.amount);
            if (!value) return;
            let qty = value;
            const target = needsMap.get(ing.name);
            if (unit && target && unit !== target) {
              const info = densityMap[ing.name] || {};
              qty = convertWithDensity(value, unit, target, {
                convert_volume_to_weight: info.convert,
                custom_density_ratio: info.ratio
              });
            }
            let arr = result.get(ing.name);
            if (!arr) {
              arr = Array(53).fill(0);
              result.set(ing.name, arr);
            }
            arr[week] += qty * mult * userMultiplier;
          });
        });
      });
    });
  });
  return result; // Map of ingredient -> weekly qty array
}

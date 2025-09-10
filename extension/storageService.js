import { DEFAULT_MULTIPLIERS } from './constants.js';
import { runMealMigrations } from './meals.js';
import { runUserMigrations, runUserCategoryDaysMigrations } from './users.js';
import { runCookingDaysMigrations } from './cookingDays.js';
import { metadata, manualMealOverrides, whatToEatCalendar, preparedMealsCalendar, mealPlan, mealPerDay, cookingDays, userCategoryDays, users, meals, stores, coupons, items } from './validators.js';

const CURRENT_VERSION = 3;

// schema validators are precompiled; see scripts/generate-validators.js
const validators = {
  items: items,
  coupons: coupons,
  stores: stores,
  meals: meals,
  users: users,
  'user-category-days': userCategoryDays,
  'cooking-days': cookingDays,
  'meal-per-day': mealPerDay,
  'meal-plan': mealPlan,
  'prepared-meals-calendar': preparedMealsCalendar,
  'what-to-eat-calendar': whatToEatCalendar,
  'manual-meal-overrides': manualMealOverrides,
  metadata: metadata
};

const cache = new Map();
let cacheEnabled = true;

const migrations = new Map();

const DEFAULTS = {
  items: [],
  coupons: [],
  stores: [],
  meals: [],
  users: [],
  'user-category-days': [],
  'cooking-days': { categories: {}, prepDay: null, version: 1 },
  'meal-per-day': DEFAULT_MULTIPLIERS,
  'meal-plan': { monthly: [], yearly: [], version: 1 },
  'prepared-meals-calendar': { calendar: {}, version: 1 },
  'what-to-eat-calendar': { calendar: {}, version: 1 },
  'manual-meal-overrides': { week: 0, users: {}, version: 1 },
  metadata: { storageVersion: CURRENT_VERSION }
};

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

async function init(options = {}) {
  cacheEnabled = options.useCache !== false;
  if (!cacheEnabled) cache.clear();

  const meta = await get('metadata', DEFAULTS.metadata);
  let version = meta?.storageVersion ?? 0;
  if (version < CURRENT_VERSION) {
    const versions = [...migrations.keys()].sort((a, b) => a - b);
    for (const v of versions) {
      if (v > version && v <= CURRENT_VERSION) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await migrations.get(v)();
          version = v;
        } catch (e) {
          console.error(`migration ${v} failed`, e);
          break;
        }
      }
    }
    await set('metadata', { storageVersion: CURRENT_VERSION });
  } else if (!meta || typeof version !== 'number') {
    await set('metadata', { storageVersion: CURRENT_VERSION });
  }
}

async function get(key, defaultValue = DEFAULTS[key]) {
  if (cacheEnabled && cache.has(key)) return cache.get(key);
  if (!hasChromeStorage()) {
    const val = defaultValue;
    if (cacheEnabled && val !== undefined) cache.set(key, val);
    return val;
  }
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(key, data => {
        let value = data[key];
        const validate = validators[key];
        if (value === undefined) {
          value = defaultValue;
        } else if (validate && !validate(value)) {
          console.error(`storageService get validation failed for ${key}`, validate.errors);
          value = defaultValue;
        }
        if (key === 'meals' && Array.isArray(value)) {
          value = value.map(runMealMigrations);
        }
        if (key === 'users' && Array.isArray(value)) {
          value = value.map((v, idx) => runUserMigrations(v, idx));
        }
        if (key === 'user-category-days' && Array.isArray(value)) {
          value = value.map((v, idx) => runUserCategoryDaysMigrations(v, idx));
        }
        if (cacheEnabled && value !== undefined) cache.set(key, value);
        resolve(value);
      });
    } catch (e) {
      console.error(`storageService get error for ${key}`, e);
      resolve(defaultValue);
    }
  });
}

async function set(key, value) {
  if (key === 'meals' && Array.isArray(value)) {
    value = value.map(runMealMigrations);
  }
  if (key === 'users' && Array.isArray(value)) {
    value = value.map((v, idx) => runUserMigrations(v, idx));
  }
  if (key === 'user-category-days' && Array.isArray(value)) {
    value = value.map((v, idx) => runUserCategoryDaysMigrations(v, idx));
  }
  const validate = validators[key];
  if (validate && !validate(value)) {
    const errorText = (validate.errors || [])
      .map(e => e.message)
      .filter(Boolean)
      .join(', ');
    const err = new Error(`Invalid data for ${key}: ${errorText}`);
    console.error(err);
    throw err;
  }
  if (cacheEnabled) cache.set(key, value);
  if (!hasChromeStorage()) return;
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    } catch (e) {
      console.error(`storageService set error for ${key}`, e);
      reject(e);
    }
  });
}

async function remove(key) {
  if (cacheEnabled) cache.delete(key);
  if (!hasChromeStorage()) return;
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(key, () => resolve());
    } catch (e) {
      console.error(`storageService remove error for ${key}`, e);
      reject(e);
    }
  });
}

async function updateItemById(key, id, patch) {
  const items = await get(key, []);
  const idx = items.findIndex(item => item.id === id);
  if (idx === -1) return false;
  items[idx] = { ...items[idx], ...patch };
  await set(key, items);
  return true;
}

function registerMigration(version, fn) {
  migrations.set(version, fn);
}

registerMigration(2, async () => {
  if (!hasChromeStorage()) return;
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(null, data => {
        const itemMap = new Map();
        const keysToRemove = [];
        for (const [key, value] of Object.entries(data)) {
          let itemName;
          if (key.startsWith('scraped_')) {
            itemName = key.slice('scraped_'.length);
            const item = itemMap.get(itemName) || { id: itemName, name: itemName, unit: '', version: 1, options: {} };
            item.options.scraped = value;
            itemMap.set(itemName, item);
            keysToRemove.push(key);
          } else if (key.startsWith('selected_')) {
            itemName = key.slice('selected_'.length);
            const item = itemMap.get(itemName) || { id: itemName, name: itemName, unit: '', version: 1, options: {} };
            item.options.selected = value;
            itemMap.set(itemName, item);
            keysToRemove.push(key);
          } else if (key.startsWith('final_')) {
            itemName = key.slice('final_'.length);
            const item = itemMap.get(itemName) || { id: itemName, name: itemName, unit: '', version: 1, options: {} };
            item.options.finalStore = value;
            itemMap.set(itemName, item);
            keysToRemove.push(key);
          }
        }
        if (itemMap.size) {
          const existingItems = Array.isArray(data.items) ? data.items : [];
          const merged = [...existingItems];
          for (const item of itemMap.values()) {
            if (!merged.find(i => i.name === item.name)) merged.push(item);
          }
          chrome.storage.local.set({ items: merged }, () => {
            if (keysToRemove.length) {
              chrome.storage.local.remove(keysToRemove, () => resolve());
            } else {
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    } catch (e) {
      console.error('migration 2 failed', e);
      resolve();
    }
  });
});

registerMigration(3, async () => {
  if (!hasChromeStorage()) return;
  return new Promise(resolve => {
    try {
      chrome.storage.local.get(['userCategoryDays', 'users', 'cookingDays'], data => {
        const migratedUsers = Array.isArray(data.users)
          ? data.users.map((u, idx) => runUserMigrations(u, idx))
          : [];
        const migratedDays = Array.isArray(data.userCategoryDays)
          ? data.userCategoryDays.map((d, idx) => runUserCategoryDaysMigrations(d, idx))
          : [];
        const migratedCooking = data.cookingDays
          ? runCookingDaysMigrations(data.cookingDays)
          : null;
        const toSet = {};
        if (migratedUsers.length) toSet.users = migratedUsers;
        if (migratedDays.length) toSet['user-category-days'] = migratedDays;
        if (migratedCooking) toSet['cooking-days'] = migratedCooking;
        chrome.storage.local.set(toSet, () => {
          const toRemove = [];
          if (data.userCategoryDays !== undefined) toRemove.push('userCategoryDays');
          if (data.cookingDays !== undefined) toRemove.push('cookingDays');
          if (toRemove.length) chrome.storage.local.remove(toRemove, () => resolve());
          else resolve();
        });
      });
    } catch (e) {
      console.error('migration 3 failed', e);
      resolve();
    }
  });
});

export { get, init, registerMigration, remove, set, updateItemById };
//# sourceMappingURL=storageService.js.map

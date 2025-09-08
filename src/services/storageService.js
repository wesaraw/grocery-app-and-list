import Ajv from 'ajv';
import { DEFAULT_MULTIPLIERS } from '../meal-multiplier/constants.js';
import { runMealMigrations } from '../migrations/meals.js';
import { runUserMigrations, runUserCategoryDaysMigrations } from '../migrations/users.js';
import { runCookingDaysMigrations } from '../migrations/cookingDays.js';

const ajv = new Ajv({ allErrors: true });

const CURRENT_VERSION = 3;

const schemas = {
  items: {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name', 'unit', 'version'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        unit: { type: 'string' },
        brand: { type: 'string', nullable: true },
        density: { type: 'number', nullable: true },
        version: { type: 'integer' },
        options: {
          type: 'object',
          properties: {
            scraped: { type: 'array', nullable: true },
            selected: { type: 'object', nullable: true },
            finalStore: { type: 'string', nullable: true }
          },
          additionalProperties: true
        },
        stock: { type: 'array', nullable: true },
        consumption: {
          type: 'array',
          nullable: true,
          items: {
            type: 'object',
            required: ['week', 'diff'],
            properties: {
              week: { type: 'integer' },
              diff: { type: 'number' },
              date: { type: 'string', nullable: true }
            },
            additionalProperties: false
          }
        },
        consumptionPlan: {
          type: 'object',
          nullable: true,
          properties: {
            monthly: { type: 'number', nullable: true },
            yearly: { type: 'number', nullable: true }
          },
          additionalProperties: false
        },
        purchases: { type: 'array', nullable: true }
      },
      additionalProperties: true
    }
  },
  coupons: {
    type: 'array',
    items: {
      type: 'object',
      required: ['itemId', 'type', 'value', 'startWeek', 'endWeek', 'store', 'version'],
      properties: {
        itemId: { type: 'string' },
        type: { type: 'string', enum: ['percent', 'fixedOff', 'fixedPrice'] },
        value: { type: 'number' },
        startWeek: { type: 'integer' },
        endWeek: { type: 'integer' },
        store: { type: 'string' },
        version: { type: 'integer' }
      },
      additionalProperties: false
    }
  },
  stores: {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name', 'version'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        location: { type: 'string', nullable: true },
        logoUrl: { type: 'string', nullable: true },
        defaultScraper: { type: 'string', nullable: true },
        version: { type: 'integer' }
      },
      additionalProperties: true
    }
  },
  meals: {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name', 'type', 'ingredients', 'flags', 'weight', 'recipeBook', 'version'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'amount', 'unit'],
            properties: {
              name: { type: 'string' },
              amount: { type: 'number' },
              unit: { type: 'string' },
              cost: { type: 'number', nullable: true }
            },
            additionalProperties: false
          }
        },
        flags: {
          type: 'object',
          properties: {
            prepared: { type: 'boolean', nullable: true },
            prepAhead: { type: 'boolean', nullable: true },
            group: { type: 'boolean', nullable: true }
          },
          additionalProperties: false
        },
        weight: { type: 'number', nullable: true },
        recipeBook: { type: 'string', nullable: true },
        users: { type: 'array', nullable: true },
        image: { type: 'string', nullable: true },
        totalCost: { type: 'number', nullable: true },
        version: { type: 'integer' }
      },
      additionalProperties: true
    }
  },
  users: {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'name', 'version'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        version: { type: 'integer' },
      },
      additionalProperties: true,
    },
  },
  'user-category-days': {
    type: 'array',
    items: {
      type: 'object',
      required: ['userId', 'schedule', 'version'],
      properties: {
        userId: { type: 'string' },
        schedule: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        version: { type: 'integer' },
      },
      additionalProperties: false,
    },
  },
  'cooking-days': {
    type: 'object',
    required: ['categories', 'prepDay', 'version'],
    properties: {
      categories: {
        type: 'object',
        additionalProperties: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      prepDay: { type: ['string', 'null'] },
      version: { type: 'integer' },
    },
    additionalProperties: false,
  },
  'meal-per-day': {
    type: 'array',
    items: {
      type: 'object',
      required: ['id', 'mealsPerDay', 'version'],
      properties: {
        id: { type: 'string' },
        mealsPerDay: { type: 'number' },
        version: { type: 'integer' }
      },
      additionalProperties: false
    }
  },
  'meal-plan': {
    type: 'object',
    required: ['monthly', 'yearly', 'version'],
    properties: {
      monthly: {
        type: 'array',
        items: {
          type: 'object',
          required: ['mealId', 'monthlySpots'],
          properties: {
            mealId: { type: 'string' },
            monthlySpots: { type: 'number' }
          },
          additionalProperties: false
        }
      },
      yearly: {
        type: 'array',
        items: {
          type: 'object',
          required: ['mealId', 'yearlySpots'],
          properties: {
            mealId: { type: 'string' },
            yearlySpots: { type: 'number' }
          },
          additionalProperties: false
        }
      },
      version: { type: 'integer' }
    },
    additionalProperties: false
  },
  'prepared-meals-calendar': {
    type: 'object',
    required: ['calendar', 'version'],
    properties: {
      calendar: { type: 'object' },
      version: { type: 'integer' }
    },
    additionalProperties: false
  },
  'what-to-eat-calendar': {
    type: 'object',
    required: ['calendar', 'version'],
    properties: {
      calendar: { type: 'object' },
      version: { type: 'integer' }
    },
    additionalProperties: false
  },
  'manual-meal-overrides': {
    type: 'object',
    required: ['week', 'users', 'version'],
    properties: {
      week: { type: 'integer' },
      users: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      },
      version: { type: 'integer' }
    },
    additionalProperties: false
  },
  metadata: {
    type: 'object',
    properties: {
      storageVersion: { type: 'integer' }
    },
    required: ['storageVersion'],
    additionalProperties: true
  }
};

const validators = {};
for (const [key, schema] of Object.entries(schemas)) {
  validators[key] = ajv.compile(schema);
}

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

export async function init(options = {}) {
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

export async function get(key, defaultValue = DEFAULTS[key]) {
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

export async function set(key, value) {
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
    const errorText = ajv.errorsText(validate.errors, { separator: ', ' });
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

export async function remove(key) {
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

export async function updateItemById(key, id, patch) {
  const items = await get(key, []);
  const idx = items.findIndex(item => item.id === id);
  if (idx === -1) return false;
  items[idx] = { ...items[idx], ...patch };
  await set(key, items);
  return true;
}

export function registerMigration(version, fn) {
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


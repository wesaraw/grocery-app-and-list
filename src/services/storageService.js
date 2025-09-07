import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

const CURRENT_VERSION = 2;

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
      required: ['id', 'name', 'type', 'version'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string' },
        people: { type: 'number', nullable: true },
        ingredients: { type: 'array', nullable: true },
        users: { type: 'array', nullable: true },
        prepared: { type: 'boolean', nullable: true },
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
        priceThresholds: { type: 'object', nullable: true },
        categoryDays: { type: 'object', nullable: true },
        version: { type: 'integer' }
      },
      additionalProperties: true
    }
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


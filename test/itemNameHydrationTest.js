import { calculatePurchaseNeeds } from '../utils/purchaseCalculator.js';
import {
  loadArray as loadItemArray,
  getItemNameMap
} from '../utils/itemStorage.js';

const storageData = {
  itemNameMap: { '8616': '8616' },
  expirationData: [{ id: '8616', shelf_life_months: 0.23094688221709006 }],
  yearlyNeeds: [
    {
      id: '8616',
      name: 'Green Beans',
      home_unit: 'oz',
      total_needed_year: 0,
      treat_as_whole_unit: false
    }
  ],
  monthlyConsumption: [
    {
      id: '8616',
      name: 'Green Beans',
      monthly_consumption: 14.289,
      unit: 'oz'
    }
  ],
  currentStock: []
};

global.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        if (keys == null) {
          cb({ ...storageData });
          return;
        }
        const result = {};
        if (typeof keys === 'string') {
          if (keys in storageData) {
            result[keys] = storageData[keys];
          }
        } else if (Array.isArray(keys)) {
          keys.forEach(key => {
            if (key in storageData) {
              result[key] = storageData[key];
            }
          });
        } else if (typeof keys === 'object') {
          Object.keys(keys || {}).forEach(key => {
            if (key in storageData) {
              result[key] = storageData[key];
            }
          });
        }
        cb(result);
      },
      set: (value, cb) => {
        Object.entries(value || {}).forEach(([key, val]) => {
          storageData[key] = val;
        });
        if (typeof cb === 'function') cb();
      }
    }
  }
};

const expiration = await loadItemArray('expirationData');
const entry = expiration.find(item => item.id === '8616');
if (!entry || entry.name !== 'Green Beans') {
  throw new Error('Expected expiration data to hydrate the Green Beans name');
}

const map = await getItemNameMap();
if (map['Green Beans'] !== '8616') {
  throw new Error('itemNameMap should map Green Beans to 8616 after hydration');
}

const needs = await loadItemArray('yearlyNeeds');
const consumption = await loadItemArray('monthlyConsumption');
const stock = await loadItemArray('currentStock');

const result = await calculatePurchaseNeeds(
  needs,
  consumption,
  stock,
  expiration,
  [],
  [],
  {},
  1,
  {},
  {},
  true,
  {}
);

const beans = result.find(item => item.name === 'Green Beans');
if (!beans) {
  throw new Error('Expected Green Beans to appear in purchase results');
}
if (!(beans.toBuy > 2 && beans.toBuy < 10)) {
  throw new Error(`Expected weekly-scale purchase need but saw ${beans.toBuy}`);
}

console.log('itemNameHydrationTest passed');

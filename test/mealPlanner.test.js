import { expect } from 'chai';
import * as storage from '../src/services/storageService.js';
import { calculateMealNeeds } from '../src/meal-planner/index.js';

function mockChrome() {
  let data = {};
  return {
    get store() {
      return data;
    },
    reset() {
      data = {};
    },
    api: {
      storage: {
        local: {
          get(key, cb) {
            if (key === null) cb({ ...data });
            else cb({ [key]: data[key] });
          },
          set(obj, cb) {
            Object.assign(data, obj);
            cb && cb();
          },
          remove(key, cb) {
            if (Array.isArray(key)) key.forEach(k => delete data[k]);
            else delete data[key];
            cb && cb();
          }
        }
      }
    }
  };
}

describe('meal-planner calculateMealNeeds', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await storage.init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('applies meal math formula across categories', async () => {
    const users = [
      { id: 'u1', name: 'U1', categoryDays: { breakfast: 6 }, version: 1 },
      { id: 'u2', name: 'U2', categoryDays: { breakfast: 6 }, version: 1 }
    ];
    const meals = [
      { id: 'm1', name: 'Pancakes', type: 'breakfast', version: 1 },
      { id: 'm2', name: 'Omelette', type: 'breakfast', version: 1 }
    ];
    await storage.set('users', users);
    await storage.set('meals', meals);

    const plan = await calculateMealNeeds();
    const entry = plan.monthly.find(m => m.mealId === 'm1');
    expect(entry.monthlySpots).to.equal(26);
    const stored = await storage.get('meal-plan');
    const y = stored.yearly.find(m => m.mealId === 'm1');
    expect(y.yearlySpots).to.equal(312);
  });
});

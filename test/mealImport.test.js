import { expect } from 'chai';
import { importMealsFromFiles } from '../src/meal-planner/index.js';
import * as storage from '../src/services/storageService.js';

function mockChrome() {
  let data = {};
  let getCalls = 0;
  return {
    get store() {
      return data;
    },
    reset() {
      data = {};
      getCalls = 0;
    },
    api: {
      storage: {
        local: {
          get(key, cb) {
            getCalls += 1;
            if (key === null) cb({ ...data });
            else if (typeof key === 'string') cb({ [key]: data[key] });
            else if (Array.isArray(key)) {
              const res = {};
              for (const k of key) res[k] = data[k];
              cb(res);
            } else cb({});
          },
          set(obj, cb) {
            Object.assign(data, obj);
            cb && cb();
          },
          remove(key, cb) {
            const keys = Array.isArray(key) ? key : [key];
            for (const k of keys) delete data[k];
            cb && cb();
          }
        }
      }
    }
  };
}

describe('meal import', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await storage.init({ useCache: false });
    await storage.set('users', [{ id: 'u1', name: 'Test', version: 1 }]);
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('imports meals and creates items with defaults', async () => {
    const xml = `<?xml version="1.0"?>\n<meals>\n  <meal>\n    <category>lunchDinner</category>\n    <name>Sample Meal</name>\n    <users>1</users>\n    <ingredients>\n      <item>\n        <name>Sample Item</name>\n        <amount>1</amount>\n        <unit>kg</unit>\n      </item>\n    </ingredients>\n  </meal>\n</meals>`;
    const files = [new File([xml], 'meals.xml', { type: 'text/xml' })];
    await importMealsFromFiles(files);

    const items = await storage.get('items');
    expect(items).to.have.length(1);
    expect(items[0]).to.include({ name: 'Sample Item', category: 'Mass Import', uom: 'kg', version: 1 });
    expect(items[0].currentStockByWeek).to.deep.equal({ 0: 0 });

    const meals = await storage.get('meals');
    expect(meals).to.have.length(1);
    expect(meals[0]).to.include({ name: 'Sample Meal', type: 'lunchDinner', version: 2 });
    expect(meals[0].ingredients[0]).to.deep.include({ name: 'Sample Item', amount: 1, unit: 'kg' });
    expect(meals[0].users).to.deep.equal(['u1']);

    const plan = await storage.get('meal-plan');
    expect(plan).to.be.an('object');
    expect(plan).to.have.property('version', 1);

    const prepared = await storage.get('prepared-meals-calendar');
    expect(prepared).to.have.property('calendar').that.is.an('object').that.is.not.empty;
    const eat = await storage.get('what-to-eat-calendar');
    expect(eat).to.have.property('calendar').that.is.an('object').that.is.not.empty;
  });
});


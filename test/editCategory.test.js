import { expect } from 'chai';
import { set, get, init } from '../src/services/storageService.js';

let updateCategory;

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

describe('edit category utility', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await init({ useCache: false });
    loadHtmlFixture('editCategory.html');
    ({ updateCategory } = await import('../extension/ui/editCategory.js'));
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('updates category of selected item', async () => {
    const items = [
      {
        id: 'i1',
        name: 'A',
        category: 'Old',
        uom: 'ea',
        volumeWeightRatio: 1,
        treatAsWholeUnit: true,
        shelfLifeWeeks: 52,
        seasonRanges: [],
        currentStockByWeek: { 0: 0 },
        consumptionPlan: { monthly: 0, yearly: 0 },
        version: 1
      }
    ];
    await set('items', items);

    await updateCategory('i1', 'New');

    const updated = await get('items');
    expect(updated[0].category).to.equal('New');
  });
});

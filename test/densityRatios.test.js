import { expect } from 'chai';
import { set, get } from '../src/services/storageService.js';
import { updateRatio } from '../extension/ui/densityRatios.js';

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

describe('density ratio editor', () => {
  const chromeMock = mockChrome();

  beforeEach(() => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('updates the volumeWeightRatio for an item', async () => {
    const items = [
      { id: 'i1', name: 'Item', unit: 'ea', volumeWeightRatio: 1, version: 1 }
    ];
    await set('items', items);

    await updateRatio('i1', 2.5);

    const updated = await get('items');
    expect(updated[0].volumeWeightRatio).to.equal(2.5);
  });
});

import { expect } from 'chai';
import { set, get, init } from '../extension/storageService.js';
import { changeUom } from '../extension/ui/uomChange.js';

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

describe('uom change utility', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('updates and normalizes the uom', async () => {
    const items = [
      { id: 'i1', name: 'Flour', unit: 'oz', uom: 'oz', version: 1 }
    ];
    await set('items', items);

    await changeUom('i1', 'LB');

    const updated = await get('items');
    expect(updated[0].uom).to.equal('lb');
    expect(updated[0].unit).to.equal('lb');
  });
});

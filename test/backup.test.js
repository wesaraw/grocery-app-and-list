import { expect } from 'chai';
import { set, get, init } from '../extension/storageService.js';
import { exportAll, importAll } from '../extension/ui/backup.js';

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

describe('backup utility', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('exports and imports storage data', async () => {
    const items = [{ id: 'i1', name: 'A', unit: 'ea', version: 1 }];
    await set('items', items);

    const exported = await exportAll();

    chromeMock.reset();
    await set('items', []); // clear cache

    await importAll(exported);

    const restored = await get('items');
    expect(restored).to.deep.equal(items);
  });
});

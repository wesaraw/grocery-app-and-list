import { expect } from 'chai';
import * as storage from '../src/services/storageService.js';

function mockChrome() {
  let data = {};
  let getCalls = 0;
  return {
    get store() {
      return data;
    },
    get getCount() {
      return getCalls;
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

describe('storageService', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await storage.init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('validates data on set', async () => {
    const bad = [{ id: '1', unit: 'kg', version: 1 }];
    try {
      await storage.set('items', bad);
      throw new Error('should fail');
    } catch (e) {
      expect(e.message).to.match(/Invalid data/);
    }
    expect(chromeMock.store.items).to.be.undefined;
  });

  it('falls back to defaults on invalid get', async () => {
    chromeMock.store.items = [{ id: '1', name: 5, unit: 'kg', version: 1 }];
    let logged = false;
    const orig = console.error;
    console.error = () => { logged = true; };
    const items = await storage.get('items');
    console.error = orig;
    expect(items).to.be.an('array').that.is.not.empty;
    expect(logged).to.equal(true);
  });

  it('executes migrations when version outdated', async () => {
    chromeMock.store.scraped_apple = [1];
    chromeMock.store.selected_apple = { price: 1 };
    chromeMock.store.final_apple = 'StoreA';
    chromeMock.store.metadata = { storageVersion: 1 };
    await storage.init({ useCache: false });
    expect(chromeMock.store.items).to.be.an('array');
    expect(chromeMock.store.items).to.deep.include({
      id: 'apple',
      name: 'apple',
      unit: '',
      version: 1,
      options: {
        scraped: [1],
        selected: { price: 1 },
        finalStore: 'StoreA'
      }
    });
    expect(chromeMock.store.scraped_apple).to.be.undefined;
    expect(chromeMock.store.metadata.storageVersion).to.equal(3);
  });

  it('uses cache when enabled', async () => {
    await storage.set('items', []);
    await storage.init();
    chromeMock.reset();
    global.chrome = chromeMock.api;
    await storage.get('items');
    await storage.get('items');
    expect(chromeMock.getCount).to.equal(1);
  });
});

import { expect } from 'chai';
import { set, get, init } from '../extension/services/storageService.js';
import { removeItem } from '../extension/ui/removeItem.js';

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

describe('remove item utility', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('removes item and related store products', async () => {
    const items = [
      { id: 'i1', name: 'A', unit: 'ea', version: 1 },
      { id: 'i2', name: 'B', unit: 'ea', version: 1 }
    ];
    const products = [
      { itemId: 'i1', store: 'S1', url: '', price: 1, unitCost: 1, image: '', scrapedAt: 0, version: 1 },
      { itemId: 'i2', store: 'S2', url: '', price: 2, unitCost: 2, image: '', scrapedAt: 0, version: 1 }
    ];
    await set('items', items);
    await set('store-products', products);

    await removeItem('i1');

    const remainingItems = await get('items');
    const remainingProducts = await get('store-products');
    expect(remainingItems.map(i => i.id)).to.deep.equal(['i2']);
    expect(remainingProducts.map(p => p.itemId)).to.deep.equal(['i2']);
  });
});

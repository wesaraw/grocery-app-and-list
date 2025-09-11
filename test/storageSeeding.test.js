import { expect } from 'chai';
import { init, get } from '../extension/storageService.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

let defaultItems;

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

describe('storageService default seeding', () => {
  const chromeMock = mockChrome();

  before(async () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const json = await readFile(resolve(__dirname, '../extension/default-data/items.json'), 'utf8');
    defaultItems = JSON.parse(json);
  });

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    chromeMock.store.items = [];
    await init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('falls back to defaults when stored array is empty', async () => {
    const items = await get('items');
    expect(items).to.deep.equal(defaultItems);
  });
});

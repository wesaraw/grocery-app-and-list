import { expect } from 'chai';
import { set, get } from '../src/services/storageService.js';
import { renameItem } from '../extension/ui/renameItem.js';

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

describe('rename item utility', () => {
  const chromeMock = mockChrome();

  beforeEach(() => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('updates the name of the selected item', async () => {
    const items = [
      { id: 'i1', name: 'Old', unit: 'ea', version: 1 }
    ];
    await set('items', items);

    await renameItem('i1', 'New');

    const updated = await get('items');
    expect(updated[0].name).to.equal('New');
  });
});

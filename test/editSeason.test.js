import { expect } from 'chai';
import { set, get } from '../src/services/storageService.js';
import { saveSeasonRanges } from '../extension/ui/editSeason.js';

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

describe('edit season ranges utility', () => {
  const chromeMock = mockChrome();

  beforeEach(() => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('saves edited seasonRanges', async () => {
    const items = [
      { id: 'i1', name: 'A', unit: 'ea', seasonRanges: [{ start: 1, end: 4 }], version: 1 }
    ];
    await set('items', items);

    await saveSeasonRanges('i1', [{ start: 2, end: 5 }]);

    const updated = await get('items');
    expect(updated[0].seasonRanges).to.deep.equal([{ start: 2, end: 5 }]);
  });
});

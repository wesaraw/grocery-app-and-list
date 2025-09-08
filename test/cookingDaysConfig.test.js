import { expect } from 'chai';
import * as storage from '../src/services/storageService.js';

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

describe('cooking days configuration', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await storage.init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('saves and updates cooking days', async () => {
    let cfg = await storage.get('cooking-days');
    expect(cfg).to.deep.equal({ categories: {}, prepDay: null, version: 1 });
    cfg.categories.Breakfast = ['Monday'];
    cfg.prepDay = 'Friday';
    await storage.set('cooking-days', cfg);
    cfg = await storage.get('cooking-days');
    expect(cfg.categories.Breakfast).to.deep.equal(['Monday']);
    expect(cfg.prepDay).to.equal('Friday');
    cfg.categories.Breakfast.push('Tuesday');
    await storage.set('cooking-days', cfg);
    cfg = await storage.get('cooking-days');
    expect(cfg.categories.Breakfast).to.deep.equal(['Monday', 'Tuesday']);
  });

  it('migrates legacy format', async () => {
    chromeMock.reset();
    chromeMock.store.cookingDays = { lunchDinner: ['Monday'], prepDay: ['Thursday'] };
    chromeMock.store.metadata = { storageVersion: 1 };
    await storage.init({ useCache: false });
    const cfg = await storage.get('cooking-days');
    expect(cfg).to.deep.equal({
      categories: { Lunch: ['Monday'] },
      prepDay: 'Thursday',
      version: 1,
    });
    expect(chromeMock.store.cookingDays).to.be.undefined;
  });
});

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

describe('users configuration', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await storage.init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('adds and edits users', async () => {
    const initial = await storage.get('users');
    expect(initial).to.be.an('array').that.is.not.empty;
    await storage.set('users', [{ id: 'u1', name: 'Alice', version: 1 }]);
    let users = await storage.get('users');
    expect(users[0].name).to.equal('Alice');
    await storage.updateItemById('users', 'u1', { name: 'Alicia' });
    users = await storage.get('users');
    expect(users[0].name).to.equal('Alicia');
  });

  it('saves schedule selections', async () => {
    await storage.set('users', [{ id: 'u1', name: 'Bob', version: 1 }]);
    await storage.set('user-category-days', [
      { userId: 'u1', schedule: { Breakfast: ['Monday'] }, version: 1 },
    ]);
    let sched = await storage.get('user-category-days');
    expect(sched[0].schedule.Breakfast).to.deep.equal(['Monday']);
    sched[0].schedule.Breakfast.push('Tuesday');
    await storage.set('user-category-days', sched);
    sched = await storage.get('user-category-days');
    expect(sched[0].schedule.Breakfast).to.deep.equal(['Monday', 'Tuesday']);
  });

  it('migrates legacy format', async () => {
    chromeMock.reset();
    chromeMock.store.users = ['Carl'];
    chromeMock.store.userCategoryDays = [{ Dinner: ['Friday'] }];
    chromeMock.store.metadata = { storageVersion: 1 };
    await storage.init({ useCache: false });
    const users = await storage.get('users');
    const days = await storage.get('user-category-days');
    expect(users).to.deep.equal([{ id: '0', name: 'Carl', version: 1 }]);
    expect(days).to.deep.equal([
      { userId: '0', schedule: { Dinner: ['Friday'] }, version: 1 },
    ]);
  });
});

import { expect } from 'chai';
import { init, get, seedDefaults } from '../extension/storageService.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

let defaultItems;
let defaultUsers;
let defaultUserCategoryDays;

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

describe('seedDefaults()', () => {
  const chromeMock = mockChrome();

  before(async () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const base = resolve(__dirname, '../extension/default-data');
    defaultItems = JSON.parse(await readFile(resolve(base, 'items.json'), 'utf8'));
    defaultUsers = JSON.parse(await readFile(resolve(base, 'users.json'), 'utf8'));
    defaultUserCategoryDays = JSON.parse(
      await readFile(resolve(base, 'user-category-days.json'), 'utf8')
    );
  });

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    chromeMock.store.items = [{ ...defaultItems[0], id: 'existing-item' }];
    chromeMock.store.users = [{ ...defaultUsers[0], id: 'existing-user' }];
    chromeMock.store['user-category-days'] = [
      { ...defaultUserCategoryDays[0], userId: 'existing-user' }
    ];
    await init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('merges missing defaults without duplicating existing records', async () => {
    const summary = await seedDefaults();
    expect(summary.items).to.equal(defaultItems.length - 1);
    expect(summary.users).to.equal(defaultUsers.length - 1);
    expect(summary.userCategoryDays).to.equal(
      defaultUserCategoryDays.length - 1
    );

    const items = await get('items');
    expect(items).to.have.length(defaultItems.length);
    expect(items.filter(i => i.name === defaultItems[0].name)).to.have.length(1);
    const insertedItem = items.find(i => i.name === defaultItems[1].name);
    expect(insertedItem).to.exist;
    expect(insertedItem.id).to.not.equal(defaultItems[1].id);
    expect(insertedItem.id).to.not.equal('existing-item');

    const users = await get('users');
    expect(users).to.have.length(defaultUsers.length);
    expect(users.filter(u => u.name === defaultUsers[0].name)).to.have.length(1);
    const insertedUser = users.find(u => u.name === defaultUsers[1].name);
    expect(insertedUser).to.exist;
    expect(insertedUser.id).to.not.equal(defaultUsers[1].id);
    expect(insertedUser.id).to.not.equal('existing-user');

    const days = await get('user-category-days');
    expect(days).to.have.length(defaultUserCategoryDays.length);
    expect(days.filter(d => d.userId === 'existing-user')).to.have.length(1);
    expect(days.filter(d => d.userId === insertedUser.id)).to.have.length(1);
  });
});

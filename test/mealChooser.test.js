import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import * as storage from '../src/services/storageService.js';
import { renderMealChooser } from '../src/meal-chooser/index.js';
import { rebuildCalendars } from '../src/meal-planner/index.js';

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
            else cb({ [key]: data[key] });
          },
          set(obj, cb) {
            Object.assign(data, obj);
            cb && cb();
          },
          remove(key, cb) {
            if (Array.isArray(key)) key.forEach(k => delete data[k]);
            else delete data[key];
            cb && cb();
          }
        }
      }
    }
  };
}

function currentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

describe('meal-chooser', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await storage.init({ useCache: false });
    await storage.set('users', [
      { id: 'u1', name: 'Alice', version: 1 },
      { id: 'u2', name: 'Bob', version: 1 }
    ]);
    await storage.set('meals', [
      { id: 'm1', name: 'Pancakes', type: 'breakfast', users: ['u1', 'u2'], version: 1 },
      { id: 'm2', name: 'Salad', type: 'lunchDinner', users: ['u1'], version: 1 }
    ]);
  });

  afterEach(() => {
    delete global.chrome;
    delete global.document;
    delete global.window;
  });

  it('saves manual overrides via UI', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    global.window = dom.window;
    global.document = dom.window.document;
    const root = document.getElementById('root');
    await renderMealChooser(root);
    const select = root.querySelector('#categorySelect');
    select.value = 'lunchDinner';
    select.dispatchEvent(new dom.window.Event('change'));
    const btn = root.querySelector('#mealButtons button');
    btn.click();
    await new Promise(r => setTimeout(r, 0));
    const overrides = await storage.get('manual-meal-overrides');
    expect(overrides.users.u1.lunchDinner).to.deep.equal(['m2']);
  });

  it('applies overrides during calendar rebuild', async () => {
    await storage.set('manual-meal-overrides', {
      week: currentWeek(),
      users: { u1: { lunchDinner: ['m2'] } },
      version: 1
    });
    await rebuildCalendars();
    const eat = await storage.get('what-to-eat-calendar');
    expect(eat.calendar.u1.lunchDinner[0]).to.equal('m2');
  });
});

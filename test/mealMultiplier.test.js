import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import * as storage from '../src/services/storageService.js';
import { renderMultiplier, hooks } from '../src/meal-multiplier/index.js';
import { DEFAULT_MEALS_PER_DAY } from '../src/meal-multiplier/constants.js';

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

describe('meal-multiplier', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await storage.init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
    delete global.document;
    delete global.window;
  });

  it('saves multiplier changes and triggers meal math', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    global.window = dom.window;
    global.document = dom.window.document;

    let called = false;
    hooks.calculateMealNeeds = async () => {
      called = true;
    };

    const root = document.getElementById('root');
    await renderMultiplier(root);

    const input = root.querySelector('tbody tr:first-child input');
    input.value = '2';
    input.dispatchEvent(new dom.window.Event('change'));

    await new Promise(r => setTimeout(r, 0));

    const stored = await storage.get('meal-per-day');
    const breakfast = stored.find(e => e.id === 'breakfast');
    expect(breakfast.mealsPerDay).to.equal(2);
    expect(called).to.equal(true);
  });

  it('loads defaults when no data stored', async () => {
    const dom = new JSDOM('<div id="root"></div>');
    global.window = dom.window;
    global.document = dom.window.document;

    const root = document.getElementById('root');
    await renderMultiplier(root);
    const values = [...root.querySelectorAll('tbody tr')].map(tr => {
      const label = tr.firstChild.textContent;
      const current = tr.children[1].textContent;
      return { label, current: Number(current) };
    });
    expect(values.length).to.equal(Object.keys(DEFAULT_MEALS_PER_DAY).length);
    expect(values.find(v => v.label === 'Breakfast').current).to.equal(1);
  });
});

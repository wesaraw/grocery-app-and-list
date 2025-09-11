import { expect } from 'chai';
import { createRequire } from 'module';
import { init } from '../extension/storageService.js';

const require = createRequire(import.meta.url);
const defaultItems = require('../extension/default-data/items.json');

function mockChrome() {
  let data = {};
  return {
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
      },
      runtime: {
        onMessage: { addListener() {} },
        sendMessage() {}
      },
      tabs: { sendMessage() {} }
    }
  };
}

describe('default data UI rendering', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await init({ useCache: false });
  });

  afterEach(() => {
    delete global.chrome;
    delete global.customElements;
    delete global.HTMLElement;
  });

  it('shows seeded items in inventory timeline', async () => {
    loadHtmlFixture('inventoryTimeline.html');
    global.HTMLElement = window.HTMLElement;
    global.customElements = window.customElements;
    await import('../extension/ui/inventoryTimeline.js');
    await new Promise(resolve => {
      const check = () => {
        if (document.querySelector('#timeline tbody tr')) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
    const name = defaultItems[0].name;
    const cells = Array.from(
      document.querySelectorAll('#timeline tbody tr td:first-child')
    );
    const match = cells.find(td => td.textContent.trim() === name);
    expect(match).to.exist;
  });

  it('shows seeded items in grocery price checker', async () => {
    loadHtmlFixture('priceChecker.html');
    global.HTMLElement = window.HTMLElement;
    global.customElements = window.customElements;
    await import('../extension/ui/priceChecker.js');
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await new Promise(resolve => {
      const check = () => {
        const list = document.getElementById('items');
        if (list.querySelector('div')) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
    const item = defaultItems[0];
    const list = document.getElementById('items');
    const row = list.querySelector(`[data-item-id="${item.id}"]`);
    expect(row).to.exist;
    expect(row.textContent).to.include(item.name);
  });
});


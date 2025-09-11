import { expect } from 'chai';
import { init } from '../extension/storageService.js';

let computeTimeline;

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
            else cb({});
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

describe('inventory timeline calculations', () => {
  const chromeMock = mockChrome();

  beforeEach(async () => {
    global.chrome = chromeMock.api;
    chromeMock.reset();
    await init({ useCache: false });
    loadHtmlFixture('inventoryTimeline.html');
    ({ computeTimeline } = await import('../extension/ui/inventoryTimeline.js'));
  });

  afterEach(() => {
    delete global.chrome;
  });

  it('computes week quantities with shelf life', () => {
    const item = { shelfLifeWeeks: 2, currentStockByWeek: { 1: 5, 2: 3 } };
    const timeline = computeTimeline(item);
    expect(timeline.slice(0, 4)).to.deep.equal([5, 8, 3, 0]);
  });

  it('handles short shelf life items', () => {
    const item = { shelfLifeWeeks: 1, currentStockByWeek: { 3: 2 } };
    const timeline = computeTimeline(item);
    expect(timeline.slice(0, 5)).to.deep.equal([0, 0, 2, 0, 0]);
  });
});

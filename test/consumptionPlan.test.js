import { expect } from 'chai';
import { init } from '../extension/storageService.js';

let applyPlanUpdate;

function mockChrome() {
  return {
    reset() {},
    api: {
      storage: {
        local: {
          get(_k, cb) { cb({}); },
          set(_o, cb) { cb && cb(); },
          remove(_k, cb) { cb && cb(); }
        }
      }
    }
  };
}

describe('applyPlanUpdate', () => {
  const chromeMock = mockChrome();

  before(async () => {
    global.chrome = chromeMock.api;
    loadHtmlFixture('edit-plan.html');
    await init({ useCache: false });
    ({ applyPlanUpdate } = await import('../extension/ui/edit-plan.js'));
  });

  after(() => {
    delete global.chrome;
  });

  it('updates yearly when monthly is set', () => {
    const item = { consumptionPlan: { monthly: 1, yearly: 12 } };
    applyPlanUpdate(item, { monthly: 2 });
    expect(item.consumptionPlan).to.deep.equal({ monthly: 2, yearly: 24 });
  });

  it('updates monthly when yearly is set', () => {
    const item = { consumptionPlan: { monthly: 1, yearly: 12 } };
    applyPlanUpdate(item, { yearly: 120 });
    expect(item.consumptionPlan.monthly).to.be.closeTo(10, 0.0001);
    expect(item.consumptionPlan.yearly).to.equal(120);
  });
});

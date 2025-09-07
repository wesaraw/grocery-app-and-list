import { expect } from 'chai';
import { applyPlanUpdate } from '../extension/ui/edit-plan.js';

describe('applyPlanUpdate', () => {
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

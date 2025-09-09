import { expect } from 'chai';
import { computeTimeline } from '../extension/ui/inventoryTimeline.js';

describe('inventory timeline calculations', () => {
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

import { expect } from 'chai';
import { set, get } from '../src/services/storageService.js';

describe('item consumption schema', () => {
  it('stores current stock entries by week', async () => {
    const items = [
      {
        id: 'i1',
        name: 'Milk',
        category: 'Dairy',
        uom: 'oz',
        volumeWeightRatio: 1,
        treatAsWholeUnit: false,
        shelfLifeWeeks: 4,
        seasonRanges: [],
        currentStockByWeek: { 5: -2 },
        consumptionPlan: { monthly: 0, yearly: 0 },
        version: 1
      }
    ];
    await set('items', items);
    const stored = await get('items');
    expect(stored[0].currentStockByWeek).to.deep.equal({ 5: -2 });
  });
});

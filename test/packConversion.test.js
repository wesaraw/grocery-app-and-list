import { expect } from 'chai';
import { calculatePackUnits } from '../extension/utils/pack.js';

describe('calculatePackUnits', () => {
  it('converts weight-based packs', () => {
    const item = { uom: 'oz', volumeWeightRatio: 1 };
    const product = { sizeQty: 2, sizeUnit: 'lb' };
    const units = calculatePackUnits(item, product, 1.5);
    expect(units).to.be.closeTo(48, 0.001);
  });

  it('converts volume to weight with density', () => {
    const item = { uom: 'oz', volumeWeightRatio: 0.5 };
    const product = { sizeQty: 1, sizeUnit: 'l' };
    const units = calculatePackUnits(item, product, 2);
    // 2 liters *0.5 g/ml -> 1000ml*0.5=500g per liter => 17.637 oz per liter
    expect(units).to.be.closeTo(35.27, 0.1);
  });
});

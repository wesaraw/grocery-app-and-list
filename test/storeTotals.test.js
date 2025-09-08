import { expect } from 'chai';
import { computeStoreTotals } from '../extension/ui/storeTotals.js';

describe('computeStoreTotals', () => {
  it('aggregates purchase and monthly totals by store', () => {
    const items = [
      {
        name: 'A',
        toBuy: 2,
        monthly: 1,
        options: {
          finalStore: 'Store1',
          selected: { pricePerUnit: 3 }
        }
      },
      {
        name: 'B',
        toBuy: 1,
        monthly: 0.5,
        options: {
          finalStore: 'Store1',
          selected: { pricePerUnit: 4 }
        }
      },
      {
        name: 'C',
        toBuy: 3,
        monthly: 2,
        options: {
          finalStore: 'Store2',
          selected: { pricePerUnit: 1 }
        }
      }
    ];
    const totals = computeStoreTotals(items);
    expect(totals).to.deep.equal({
      Store1: {
        purchase: 10,
        monthly: 5,
        items: [
          { name: 'A', purchase: 6, monthly: 3 },
          { name: 'B', purchase: 4, monthly: 2 }
        ]
      },
      Store2: {
        purchase: 3,
        monthly: 2,
        items: [{ name: 'C', purchase: 3, monthly: 2 }]
      }
    });
  });
});

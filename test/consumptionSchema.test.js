import { expect } from 'chai';
import { set, get } from '../src/services/storageService.js';

describe('item consumption schema', () => {
  it('stores consumption entries with week and diff', async () => {
    const items = [
      {
        id: 'i1',
        name: 'Milk',
        unit: 'oz',
        version: 1,
        consumption: [{ week: 5, diff: -2, date: '2024-05-01' }]
      }
    ];
    await set('items', items);
    const stored = await get('items');
    expect(stored[0].consumption[0]).to.include({ week: 5, diff: -2 });
  });
});

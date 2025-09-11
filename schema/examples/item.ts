import { Item } from '../../src/models/index';

const item: Item = {
  id: 'item-1',
  name: 'Apple',
  category: 'fruit',
  unit: 'Oz',
  volumeWeightRatio: 1,
  treatAsWholeUnit: true,
  shelfLifeWeeks: 2,
  seasonRanges: [{ start: 1, end: 12 }],
  currentStockByWeek: { 1: 5 },
  consumptionPlan: { monthly: 4, yearly: 48 },
  version: 1,
};

export default item;

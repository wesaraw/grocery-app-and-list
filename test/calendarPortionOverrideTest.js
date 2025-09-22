import { aggregateCalendar, weekNumber } from '../utils/calendarUtils.js';

const calendar = {
  Alice: {
    '2024-01-01': { lunchDinner: ['M1'] }
  },
  Bob: {
    '2024-01-01': { lunchDinner: ['M1'] }
  }
};

const mealsByCategory = {
  lunchDinner: [
    {
      id: 'M1',
      name: 'Hotdog Night',
      multiplier: 1,
      ingredients: [{ name: 'Hotdog', amount: '1 ea' }],
      users: [true, true],
      userPortionOverrides: [1, 2]
    }
  ]
};

const needsMap = new Map([['Hotdog', 'ea']]);
const densityMap = {};
const multipliers = new Map([
  ['Alice', 1],
  ['Bob', 1]
]);
const userIndexLookup = new Map([
  ['Alice', 0],
  ['Bob', 1]
]);

const aggregated = aggregateCalendar(
  calendar,
  mealsByCategory,
  needsMap,
  densityMap,
  true,
  multipliers,
  userIndexLookup
);

const hotdogArr = aggregated.get('Hotdog');
if (!hotdogArr) {
  throw new Error('Expected Hotdog entry in aggregated calendar results');
}

const weekIdx = weekNumber('2024-01-01');
const expectedQty = 1 * 1 + 1 * 2;
const actualQty = hotdogArr[weekIdx];
if (Math.abs(actualQty - expectedQty) > 1e-9) {
  throw new Error(
    `Weekly hotdog quantity mismatch: expected ${expectedQty} but received ${actualQty}`
  );
}

console.log('calendar portion override test passed');

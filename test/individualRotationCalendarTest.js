import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['Alice', 'Bob'];
const preparedCal = {};
const subscriptions = {
  Alice: { breakfast: [{ name: 'Eggs' }, { name: 'Bacon' }] },
  Bob: { breakfast: [{ name: 'Eggs' }, { name: 'Cereal' }] }
};
const eatingDays = {
  Alice: {
    breakfast: {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      slots: [['Monday', 'Tuesday', 'Wednesday', 'Thursday']]
    }
  },
  Bob: {
    breakfast: {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      slots: [['Monday', 'Tuesday', 'Wednesday', 'Thursday']]
    }
  }
};
const mealsPerDay = { breakfast: 1 };
const startDate = '2023-01-02'; // Monday

const cal = generateWhatToEatCalendar(
  users,
  preparedCal,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1,
  {}
);

const days = ['2023-01-02', '2023-01-03', '2023-01-04', '2023-01-05'];

const getId = value =>
  value && typeof value === 'object' ? value.mealId || value.id || value.name || null : value;

function expectEqual(a, b, msg) {
  const val = getId(a);
  if (val !== b) throw new Error(msg + ` (expected ${b} got ${val})`);
}

expectEqual(cal.Alice[days[0]].breakfast, 'Eggs', 'day1 Alice');
expectEqual(cal.Bob[days[0]].breakfast, 'Eggs', 'day1 Bob');
expectEqual(cal.Alice[days[1]].breakfast, 'Bacon', 'day2 Alice');
expectEqual(cal.Bob[days[1]].breakfast, 'Cereal', 'day2 Bob');
expectEqual(cal.Alice[days[2]].breakfast, 'Eggs', 'day3 Alice');
expectEqual(cal.Bob[days[2]].breakfast, 'Eggs', 'day3 Bob');
expectEqual(cal.Alice[days[3]].breakfast, 'Bacon', 'day4 Alice');
expectEqual(cal.Bob[days[3]].breakfast, 'Cereal', 'day4 Bob');

console.log('individual rotation calendar test passed');

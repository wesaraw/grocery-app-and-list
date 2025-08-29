import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['Alice', 'Bob'];
const preparedCal = {};
const subscriptions = {
  Alice: { breakfast: [{ name: 'Eggs' }, { name: 'Bacon' }] },
  Bob: { breakfast: [{ name: 'Eggs' }, { name: 'Cereal' }] }
};
const eatingDays = {
  Alice: { breakfast: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  Bob: { breakfast: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] }
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

function expectEqual(a, b, msg) {
  if (a !== b) throw new Error(msg + ` (expected ${b} got ${a})`);
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

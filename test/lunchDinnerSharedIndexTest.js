import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['Alice', 'Bob'];
const preparedCal = {};
const subscriptions = {
  Alice: { lunchDinner: [
    { name: 'Chicken', groupMeal: true },
    { name: 'Beef', groupMeal: true }
  ] },
  Bob: { lunchDinner: [
    { name: 'Chicken', groupMeal: true },
    { name: 'Pork', groupMeal: true }
  ] }
};
const eatingDays = {
  Alice: { lunchDinner: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] },
  Bob: { lunchDinner: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] }
};
const mealsPerDay = { lunchDinner: 1 };
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

expectEqual(cal.Alice[days[0]].lunchDinner, 'Chicken', 'day1 Alice');
expectEqual(cal.Bob[days[0]].lunchDinner, 'Chicken', 'day1 Bob');
expectEqual(cal.Alice[days[1]].lunchDinner, 'Beef', 'day2 Alice');
expectEqual(cal.Bob[days[1]].lunchDinner, 'Chicken', 'day2 Bob fallback 1');
expectEqual(cal.Alice[days[2]].lunchDinner, 'Chicken', 'day3 Alice');
expectEqual(cal.Bob[days[2]].lunchDinner, 'Chicken', 'day3 Bob resync');
expectEqual(cal.Alice[days[3]].lunchDinner, 'Beef', 'day4 Alice');
expectEqual(cal.Bob[days[3]].lunchDinner, 'Pork', 'day4 Bob fallback 2');

console.log('lunch/dinner shared index test passed');

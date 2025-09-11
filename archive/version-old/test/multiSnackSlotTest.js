import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['u1', 'u2'];
const snacks = [{ id: 'S1' }, { id: 'S2' }];
const prepared = {};
const subscriptions = { u1: { snack: snacks }, u2: { snack: snacks } };
const eatingDays = { u1: { snack: ['Monday'] }, u2: { snack: ['Monday'] } };
const mealsPerDay = { snack: 2 };
const startDate = new Date('2024-01-01');

const cal = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1
);

const s1 = cal.u1['2024-01-01'].snack;
const s2 = cal.u2['2024-01-01'].snack;
if (!Array.isArray(s1) || s1.length !== 2) {
  throw new Error('User 1 snack slots missing');
}
if (s1[0] === s1[1]) {
  throw new Error('Snack slots returned same meal');
}
if (s1[0] !== s2[0] || s1[1] !== s2[1]) {
  throw new Error('Users did not share same snack picks');
}
console.log('multi snack slot test passed');

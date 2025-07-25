import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['u1'];
const snacks = [{ id: 'S1' }, { id: 'S2' }, { id: 'S3' }];
const prepared = {};
const subscriptions = { u1: { snack: snacks } };
const eatingDays = { u1: { snack: ['Monday'] } };
const mealsPerDay = { snack: 3 };
const startDate = new Date('2024-01-01'); // Monday

const cal = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1
);

const s = cal.u1['2024-01-01'].snack;
if (!Array.isArray(s) || s.length !== 3) {
  throw new Error('Snack slots incorrect');
}
const unique = new Set(s);
if (unique.size !== 3) {
  throw new Error('Snacks for the day were not unique');
}
console.log('unique snack selection test passed');

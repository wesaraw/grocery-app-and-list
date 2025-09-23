import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['u1', 'u2'];
const meals = [
  { id: 'D1', weight: 1, groupMeal: true },
  { id: 'D2', weight: 1, groupMeal: true }
];
const prepared = {};
const subscriptions = { u1: { dinner: meals }, u2: { dinner: meals } };
const eatingDays = {
  u1: { dinner: { days: ['Monday'], slots: [['Monday']] } },
  u2: { dinner: { days: ['Monday'], slots: [['Monday']] } }
};
const mealsPerDay = { dinner: 1 };
const startDate = new Date('2024-01-01');
const cal = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  3
);
const getId = value =>
  value && typeof value === 'object' ? value.mealId || value.id || null : value;
const picks1 = Object.values(cal.u1)
  .map(d => getId(d.dinner))
  .filter(Boolean);
const picks2 = Object.values(cal.u2)
  .map(d => getId(d.dinner))
  .filter(Boolean);
if (picks1.join(',') !== picks2.join(',')) {
  throw new Error(`Users received different meals: ${picks1.join(',')} vs ${picks2.join(',')}`);
}
console.log('shared state calendar test passed');

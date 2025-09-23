import { generatePreparedMealsCalendar } from '../utils/preparedMealsCalendar.js';
import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['u'];
const meals = [
  { id: 'A', prepared: true, weight: 2 },
  { id: 'B', prepared: true, weight: 1 }
];
const cookingDays = { lunchDinner: ['Monday'] };
const mealsByCategory = { lunchDinner: meals };
const startDate = new Date('2024-01-01');
const prepared = generatePreparedMealsCalendar(cookingDays, mealsByCategory, startDate, 3);
const subscriptions = { u: { lunchDinner: meals } };
const eatingDays = {
  u: { lunchDinner: { days: ['Monday'], slots: [['Monday']] } }
};
const mealsPerDay = { lunchDinner: 1 };
const what = generateWhatToEatCalendar(users, prepared, subscriptions, eatingDays, mealsPerDay, startDate, 3);

const picks = Object.values(prepared).map(d => d.lunchDinner);
const countA = picks.filter(p => p === 'A').length;
const countB = picks.filter(p => p === 'B').length;
if (!(countA === 2 && countB === 1)) {
  throw new Error(`Prepared weighting failed: A ${countA} B ${countB}`);
}

const picks2 = Object.values(what.u).map(d => d.lunchDinner);
const countA2 = picks2.filter(p => p === 'A').length;
const countB2 = picks2.filter(p => p === 'B').length;
if (!(countA2 === 2 && countB2 === 1)) {
  throw new Error(`WhatToEat weighting failed: A ${countA2} B ${countB2}`);
}
console.log('weighting calendar tests passed');

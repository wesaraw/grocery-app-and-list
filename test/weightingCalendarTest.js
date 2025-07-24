import { generatePreparedMealsCalendar } from '../utils/preparedMealsCalendar.js';
import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['u'];
const meals = [
  { id: 'A', prepared: true, weight: 2 },
  { id: 'B', prepared: true, weight: 1 }
];
const cookingDays = { lunchDinner: ['Monday'] };
const mealsByCategory = { lunchDinner: meals };
const startDate = new Date('2024-01-01'); // Monday
const prepared = generatePreparedMealsCalendar(cookingDays, mealsByCategory, startDate, 3);
const subscriptions = { u: { lunchDinner: meals } };
const eatingDays = { u: { lunchDinner: ['Monday'] } };
const mealsPerDay = { lunchDinner: 1 };
const what = generateWhatToEatCalendar(users, prepared, subscriptions, eatingDays, mealsPerDay, startDate, 3);

const picks = Object.values(prepared)
  .map(d => d.lunchDinner)
  .filter(Boolean);
const countA = picks.filter(p => p === 'A').length;
const countB = picks.filter(p => p === 'B').length;
if (!(countA === 2 && countB === 1 && picks.join(',') === 'A,B,A')) {
  throw new Error(
    `Prepared weighting failed: A ${countA} B ${countB} order ${picks.join(',')}`
  );
}

const picks2 = Object.values(what.u)
  .map(d => d.lunchDinner)
  .filter(Boolean);
const countA2 = picks2.filter(p => p === 'A').length;
const countB2 = picks2.filter(p => p === 'B').length;
if (!(countA2 === 2 && countB2 === 1 && picks2.join(',') === 'A,B,A')) {
  throw new Error(
    `WhatToEat weighting failed: A ${countA2} B ${countB2} order ${picks2.join(',')}`
  );
}

// fractional weight test
const mealsFrac = [
  { id: 'X', prepared: true, weight: 1 },
  { id: 'Y', prepared: true, weight: 0.5 }
];
const mealsByCategoryFrac = { lunchDinner: mealsFrac };
const preparedFrac = generatePreparedMealsCalendar(cookingDays, mealsByCategoryFrac, startDate, 3);
const subsFrac = { u: { lunchDinner: mealsFrac } };
const whatFrac = generateWhatToEatCalendar(users, preparedFrac, subsFrac, eatingDays, mealsPerDay, startDate, 3);
const picksPrepF = Object.values(preparedFrac)
  .map(d => d.lunchDinner)
  .filter(Boolean);
const countXF = picksPrepF.filter(p => p === 'X').length;
const countYF = picksPrepF.filter(p => p === 'Y').length;
if (!(countXF === 2 && countYF === 1 && picksPrepF.join(',') === 'X,Y,X')) {
  throw new Error(
    `Prepared fractional failed: X ${countXF} Y ${countYF} order ${picksPrepF.join(',')}`
  );
}
const picksFrac = Object.values(whatFrac.u)
  .map(d => d.lunchDinner)
  .filter(Boolean);
const countXF2 = picksFrac.filter(p => p === 'X').length;
const countYF2 = picksFrac.filter(p => p === 'Y').length;
if (!(countXF2 === 2 && countYF2 === 1 && picksFrac.join(',') === 'X,Y,X')) {
  throw new Error(
    `WhatToEat fractional failed: X ${countXF2} Y ${countYF2} order ${picksFrac.join(',')}`
  );
}
console.log('weighting calendar tests passed');

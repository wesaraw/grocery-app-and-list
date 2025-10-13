import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';
import { groupWeeklyOverridesByDateAndUser } from '../utils/weeklyMealOverrides.js';

function mealIdFromValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return mealIdFromValue(value[0]);
  }
  if (typeof value === 'object') {
    return value.mealId || value.id || value.name || null;
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

const users = ['Wes'];
const prepared = {};
const snacks = [
  { id: 'SNACK-NON-PREP', name: 'Granola', weight: 1 },
  { id: 'SNACK-PREP', name: 'Egg Muffins', prepared: true, weight: 1 }
];
const subscriptions = { Wes: { snack: snacks } };
const eatingDays = {
  Wes: { snack: { days: ['Monday'], slots: [['Monday']] } }
};
const mealsPerDay = { snack: 1 };
const startDate = '2024-10-14';

const baseline = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1
);

const baselineSnack = mealIdFromValue(baseline.calendar.Wes[startDate]?.snack);
if (baselineSnack !== 'SNACK-NON-PREP') {
  throw new Error(
    `Expected non-prepared snack without overrides but received ${baselineSnack}`
  );
}

const weeklyOverrideEntries = [
  {
    id: 'override-snack',
    userIndex: 0,
    year: 2024,
    week: 42,
    date: startDate,
    categoryId: 'snack',
    slotIndex: 0,
    mealId: 'SNACK-PREP'
  }
];

const groupedOverrides = groupWeeklyOverridesByDateAndUser(
  weeklyOverrideEntries,
  users
);

const overrideResult = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1,
  {},
  {},
  {},
  groupedOverrides
);

const overrideSnack = mealIdFromValue(overrideResult.calendar.Wes[startDate]?.snack);
if (overrideSnack !== 'SNACK-PREP') {
  throw new Error(
    `Forced prepared snack should override slot; expected SNACK-PREP but received ${overrideSnack}`
  );
}

console.log('forced prepared override test passed');

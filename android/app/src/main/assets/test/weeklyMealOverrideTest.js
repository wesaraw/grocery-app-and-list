import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';
import { groupWeeklyOverridesByDateAndUser } from '../utils/weeklyMealOverrides.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

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

const users = ['Quinn'];
const prepared = {};
const dinnerMeals = [
  { id: 'DIN-A', name: 'Override Meal', weight: 1 },
  { id: 'DIN-B', name: 'Rotation Meal', weight: 1 }
];
const subscriptions = {
  Quinn: {
    dinner: dinnerMeals
  }
};
const eatingDays = {
  Quinn: {
    dinner: {
      days: ['Monday', 'Tuesday'],
      slots: [['Monday', 'Tuesday']]
    }
  }
};
const mealsPerDay = { dinner: 1 };
const startDate = '2024-02-05';

const weeklyOverrideEntries = [
  {
    id: 'override-1',
    userIndex: 0,
    year: 2024,
    week: 6,
    date: '2024-02-05',
    categoryId: 'dinner',
    slotIndex: 0,
    mealId: 'DIN-A'
  }
];

const groupedOverrides = groupWeeklyOverridesByDateAndUser(
  weeklyOverrideEntries,
  users
);

const baseline = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  2,
  {},
  {},
  {}
);

const overrideResult = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  2,
  {},
  {},
  {},
  groupedOverrides
);

const forcedDate = '2024-02-05';
const forcedMeal = mealIdFromValue(overrideResult.calendar.Quinn[forcedDate]?.dinner);
assert(forcedMeal === 'DIN-A', 'Weekly override should force the specified meal slot');

const nextDay = '2024-02-06';
const nextDayMeal = mealIdFromValue(overrideResult.calendar.Quinn[nextDay]?.dinner);
assert(
  nextDayMeal === 'DIN-B',
  `Round-robin weighting should account for overrides; expected DIN-B but received ${nextDayMeal}`
);

const nextWeekDate = '2024-02-12';
const baselineNextWeekOnly = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  nextWeekDate,
  1,
  {},
  {},
  {}
);
const overrideNextWeekOnly = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  nextWeekDate,
  1,
  {},
  {},
  {},
  groupedOverrides
);
const baselineNextWeek = mealIdFromValue(baselineNextWeekOnly.calendar.Quinn[nextWeekDate]?.dinner);
const overrideNextWeek = mealIdFromValue(overrideNextWeekOnly.calendar.Quinn[nextWeekDate]?.dinner);
assert(
  overrideNextWeek === baselineNextWeek,
  'Weekly overrides should only affect the targeted ISO week'
);

console.log('weekly meal override test passed');

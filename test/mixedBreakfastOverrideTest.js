import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['Wes', 'Merrilynn', 'Bella', 'Aria', 'Noah'];
const overrideUsers = new Set(['Wes', 'Merrilynn', 'Bella']);
const startDate = new Date('2024-01-01');

const breakfastMeals = [
  {
    id: 'PARFAIT',
    name: 'Parfait',
    weight: 5,
    groupMeal: true,
    prepared: true
  },
  {
    id: 'SMOOTHIE',
    name: 'Smoothie',
    weight: 1,
    groupMeal: true,
    prepared: true
  }
];
const lunchMeals = [
  { id: 'LUNCH_A', name: 'Lunch A', weight: 1 },
  { id: 'LUNCH_B', name: 'Lunch B', weight: 1 }
];

const subscriptions = {};
const eatingDays = {};
users.forEach(user => {
  subscriptions[user] = {
    breakfast: breakfastMeals,
    lunchDinner: lunchMeals
  };
  eatingDays[user] = {
    breakfast: { days: ['Monday'], slots: [['Monday']] },
    lunchDinner: { days: ['Monday'], slots: [['Monday'], ['Monday']] }
  };
});

const overrides = {};
overrideUsers.forEach(user => {
  overrides[user] = {
    Monday: {
      lunchDinner: {
        0: 'breakfast'
      }
    }
  };
});

const mealsPerDay = { breakfast: 1, lunchDinner: 2 };

const preparedCalendar = {
  '2024-01-01': {
    breakfast: 'PARFAIT'
  }
};

const { calendar } = generateWhatToEatCalendar(
  users,
  preparedCalendar,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1,
  {},
  {},
  overrides
);

const mondayKey = '2024-01-01';

const getId = value =>
  value && typeof value === 'object' ? value.mealId || value.id || null : value;

const expectedBreakfastId = getId(calendar.Wes?.[mondayKey]?.breakfast);
if (expectedBreakfastId !== 'PARFAIT') {
  throw new Error(
    `Expected shared breakfast pick to be Parfait, received ${expectedBreakfastId}`
  );
}

users.forEach(user => {
  const dayEntry = calendar[user]?.[mondayKey];
  if (!dayEntry) {
    throw new Error(`Missing Monday calendar entry for ${user}`);
  }

  const breakfastId = getId(dayEntry.breakfast);
  if (breakfastId !== expectedBreakfastId) {
    throw new Error(
      `${user} expected breakfast ${expectedBreakfastId} but received ${breakfastId}`
    );
  }

  const lunchSlots = Array.isArray(dayEntry.lunchDinner)
    ? dayEntry.lunchDinner.map(getId)
    : dayEntry.lunchDinner != null
    ? [getId(dayEntry.lunchDinner)]
    : [];

  if (!lunchSlots.length) {
    throw new Error(`${user} expected lunch/dinner slots to be populated`);
  }

  if (overrideUsers.has(user)) {
    if (lunchSlots[0] !== expectedBreakfastId) {
      throw new Error(
        `${user} override slot should mirror breakfast ${expectedBreakfastId}, received ${lunchSlots[0]}`
      );
    }
  } else if (lunchSlots[0] !== 'LUNCH_A') {
    throw new Error(
      `${user} should keep lunch meal LUNCH_A in first slot, received ${lunchSlots[0]}`
    );
  }
});

console.log('mixed breakfast override test passed');

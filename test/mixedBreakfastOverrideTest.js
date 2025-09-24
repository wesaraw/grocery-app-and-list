import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['Wes', 'Merrilynn', 'Bella', 'Becky', 'Val'];
const overrideUsers = new Set(['Wes', 'Merrilynn', 'Bella']);
const startDate = new Date('2024-09-23');

const breakfastMeals = [
  {
    id: 'PARFAIT',
    name: 'Parfait',
    weight: 1,
    groupMeal: true,
    prepared: true
  },
  {
    id: 'SMOOTHIE',
    name: 'Smoothie',
    weight: 10,
    groupMeal: true,
    prepared: true
  }
];
const lunchMeals = [
  { id: 'LUNCH_A', name: 'Lunch A', weight: 1 },
  { id: 'LUNCH_B', name: 'Lunch B', weight: 1 }
];
const lunchMealIds = new Set(lunchMeals.map(meal => meal.id || meal.name));

const subscriptions = {};
const eatingDays = {};
const activeDays = ['Thursday', 'Saturday', 'Sunday'];
users.forEach(user => {
  subscriptions[user] = {
    breakfast: breakfastMeals,
    lunchDinner: lunchMeals
  };
  eatingDays[user] = {
    breakfast: { days: activeDays, slots: [activeDays] },
    lunchDinner: { days: activeDays, slots: [activeDays, activeDays] }
  };
});

const overrides = {};
overrideUsers.forEach(user => {
  overrides[user] = {};
  activeDays.forEach(day => {
    overrides[user][day] = {
      lunchDinner: {
        0: 'breakfast'
      }
    };
  });
});

const mealsPerDay = { breakfast: 1, lunchDinner: 2 };

const preparedCalendar = {
  '2024-09-26': {
    breakfast: 'PARFAIT'
  },
  '2024-09-28': {
    breakfast: 'PARFAIT'
  },
  '2024-09-29': {
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

const getId = value =>
  value && typeof value === 'object' ? value.mealId || value.id || null : value;
const preparedDays = Object.keys(preparedCalendar);
preparedDays.forEach(dayKey => {
  const expectedBreakfastId = 'PARFAIT';

  users.forEach(user => {
    const dayEntry = calendar[user]?.[dayKey];
    if (!dayEntry) {
      throw new Error(`Missing ${dayKey} calendar entry for ${user}`);
    }

    const breakfastId = getId(dayEntry.breakfast);
    if (breakfastId !== expectedBreakfastId) {
      throw new Error(
        `${user} expected breakfast ${expectedBreakfastId} on ${dayKey} but received ${breakfastId}`
      );
    }

    const lunchSlots = Array.isArray(dayEntry.lunchDinner)
      ? dayEntry.lunchDinner.map(getId)
      : dayEntry.lunchDinner != null
      ? [getId(dayEntry.lunchDinner)]
      : [];

    if (!lunchSlots.length) {
      throw new Error(`${user} expected lunch/dinner slots to be populated on ${dayKey}`);
    }

    if (overrideUsers.has(user)) {
      if (lunchSlots[0] !== expectedBreakfastId) {
        throw new Error(
          `${user} override slot should mirror breakfast ${expectedBreakfastId} on ${dayKey}, received ${lunchSlots[0]}`
        );
      }
    } else {
      if (lunchSlots[0] === expectedBreakfastId) {
        throw new Error(
          `${user} should keep a lunch meal in first slot on ${dayKey}, but received the prepared breakfast`
        );
      }
      if (!lunchMealIds.has(lunchSlots[0])) {
        throw new Error(
          `${user} expected first lunch slot to remain a lunch meal on ${dayKey}, received ${lunchSlots[0]}`
        );
      }
    }
  });
});

console.log('mixed breakfast override test passed');

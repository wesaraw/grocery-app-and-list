import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

// Scenario: Alice usually eats two lunch/dinner slots on Mondays, but the first slot
// should be treated as a breakfast meal. The override should draw from the
// breakfast pool for that slot while leaving the second lunch slot untouched.
const users = ['Alice'];
const prepared = {};
const breakfastMeals = [
  { id: 'B1', name: 'Breakfast Burrito', weight: 1 }
];
const lunchMeals = [
  { id: 'L1', name: 'Lunch Salad', weight: 1 }
];
const subscriptions = {
  Alice: {
    breakfast: breakfastMeals,
    lunchDinner: lunchMeals
  }
};
const eatingDays = {
  Alice: {
    breakfast: ['Monday'],
    lunchDinner: ['Monday']
  }
};
const mealsPerDay = {
  breakfast: 1,
  lunchDinner: 2
};
const startDate = new Date('2024-01-01');
const overrides = {
  Alice: {
    Monday: {
      lunchDinner: {
        0: 'breakfast'
      }
    }
  }
};

const calendar = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1,
  {},
  {},
  overrides
);

const monday = calendar.Alice['2024-01-01'];
if (!monday) {
  throw new Error('Missing Monday entry for Alice');
}
const lunch = monday.lunchDinner;
if (!Array.isArray(lunch) || lunch.length !== 2) {
  throw new Error('Expected two lunch/dinner slots after override');
}
if (lunch[0] !== 'B1') {
  throw new Error(`Override slot did not use breakfast meal: ${lunch[0]}`);
}
if (lunch[1] !== 'L1') {
  throw new Error(`Second lunch slot should remain lunch meal: ${lunch[1]}`);
}
if (monday.breakfast !== 'B1') {
  throw new Error(`Breakfast slot should keep breakfast meal: ${monday.breakfast}`);
}

console.log('meal slot override calendar test passed');

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

// Scenario: Two users override the same lunch slot to breakfast, and the breakfast
// category exposes two group meals. The override slot should schedule the second
// shared meal independently of the base breakfast rotation so both shared meals
// appear on the calendar.
const multiUsers = ['Alice', 'Bob'];
const sharedPrepared = {};
const breakfastGroupMeals = [
  { id: 'GB1', name: 'Group Pancakes', weight: 1, groupMeal: true },
  { id: 'GB2', name: 'Group Waffles', weight: 1, groupMeal: true }
];
const sharedSubscriptions = {
  Alice: {
    breakfast: breakfastGroupMeals,
    lunchDinner: lunchMeals
  },
  Bob: {
    breakfast: breakfastGroupMeals,
    lunchDinner: lunchMeals
  }
};
const sharedEatingDays = {
  Alice: {
    breakfast: ['Monday']
  },
  Bob: {
    breakfast: ['Monday']
  }
};
const sharedMealsPerDay = {
  breakfast: 1,
  lunchDinner: 1
};
const sharedOverrides = {
  Alice: {
    Monday: {
      lunchDinner: {
        0: 'breakfast'
      }
    }
  },
  Bob: {
    Monday: {
      lunchDinner: {
        0: 'breakfast'
      }
    }
  }
};

const sharedCalendar = generateWhatToEatCalendar(
  multiUsers,
  sharedPrepared,
  sharedSubscriptions,
  sharedEatingDays,
  sharedMealsPerDay,
  startDate,
  1,
  {},
  {},
  sharedOverrides
);

const aliceMonday = sharedCalendar.Alice['2024-01-01'];
const bobMonday = sharedCalendar.Bob['2024-01-01'];
if (!aliceMonday || !bobMonday) {
  throw new Error('Missing Monday entries for override participants');
}
if (aliceMonday.breakfast !== 'GB1' || bobMonday.breakfast !== 'GB1') {
  throw new Error('Base breakfast slot should schedule the first group meal');
}
if (aliceMonday.lunchDinner !== 'GB2') {
  throw new Error(
    `Alice override slot should schedule the second group meal, received ${aliceMonday.lunchDinner}`
  );
}
if (bobMonday.lunchDinner !== 'GB2') {
  throw new Error(
    `Bob override slot should schedule the second group meal, received ${bobMonday.lunchDinner}`
  );
}

// Scenario: A category with a multiplier of 0 should not create an automatic slot
// but can still be used as an override target from another category.
const zeroUsers = ['Casey'];
const zeroSubscriptions = {
  Casey: {
    dinner: [{ id: 'D1', name: 'Dinner Default', weight: 1 }],
    treat: [{ id: 'T1', name: 'Treat Meal', weight: 1 }]
  }
};
const zeroEatingDays = {
  Casey: {
    dinner: ['Monday'],
    treat: ['Monday']
  }
};
const zeroMealsPerDay = {
  dinner: 1,
  treat: 0
};
const zeroOverrides = {
  Casey: {
    Monday: {
      dinner: {
        0: 'treat'
      }
    }
  }
};

const zeroCalendar = generateWhatToEatCalendar(
  zeroUsers,
  {},
  zeroSubscriptions,
  zeroEatingDays,
  zeroMealsPerDay,
  startDate,
  1,
  {},
  {},
  zeroOverrides
);

const zeroMonday = zeroCalendar.Casey['2024-01-01'];
if (!zeroMonday) {
  throw new Error('Missing Monday entry for Casey in zero-multiplier test');
}
if ('treat' in zeroMonday) {
  throw new Error('Treat category should not create a calendar entry when multiplier is 0');
}
if (zeroMonday.dinner !== 'T1') {
  throw new Error(`Override did not pull treat meal into dinner slot: ${zeroMonday.dinner}`);
}

console.log('meal slot override calendar tests passed');

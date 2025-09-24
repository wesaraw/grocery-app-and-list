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
    breakfast: { days: ['Monday'], slots: [['Monday']] },
    lunchDinner: { days: ['Monday'], slots: [['Monday'], ['Monday']] }
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

const { calendar } = generateWhatToEatCalendar(
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
const getId = value =>
  value && typeof value === 'object' ? value.mealId || value.id || null : value;
if (getId(lunch[0]) !== 'B1') {
  throw new Error(`Override slot did not use breakfast meal: ${getId(lunch[0])}`);
}
if (getId(lunch[1]) !== 'L1') {
  throw new Error(`Second lunch slot should remain lunch meal: ${getId(lunch[1])}`);
}
if (getId(monday.breakfast) !== 'B1') {
  throw new Error(`Breakfast slot should keep breakfast meal: ${getId(monday.breakfast)}`);
}

// Scenario: Two users override the same lunch slot to breakfast, and the breakfast
// category exposes two group meals. The override slot should align with the
// first shared breakfast meal so that all participants share the same initial
// occurrence.
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
    breakfast: { days: ['Monday'], slots: [['Monday']] }
  },
  Bob: {
    breakfast: { days: ['Monday'], slots: [['Monday']] }
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

const { calendar: sharedCalendar } = generateWhatToEatCalendar(
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
if (getId(aliceMonday.breakfast) !== 'GB1' || getId(bobMonday.breakfast) !== 'GB1') {
  throw new Error('Base breakfast slot should schedule the first group meal');
}
if (getId(aliceMonday.lunchDinner) !== 'GB1') {
  throw new Error(
    `Alice override slot should align with the first group meal, received ${aliceMonday.lunchDinner}`
  );
}
if (getId(bobMonday.lunchDinner) !== 'GB1') {
  throw new Error(
    `Bob override slot should align with the first group meal, received ${bobMonday.lunchDinner}`
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
    dinner: { days: ['Monday'], slots: [['Monday']] },
    treat: { days: ['Monday'], slots: [['Monday']] }
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

const { calendar: zeroCalendar } = generateWhatToEatCalendar(
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
if (getId(zeroMonday.dinner) !== 'T1') {
  throw new Error(`Override did not pull treat meal into dinner slot: ${getId(zeroMonday.dinner)}`);
}

// Scenario: A category with zero automatic slots still processes its override map
// so the override meal is scheduled even though the base loop would otherwise skip
// the category entirely.
const zeroOverrideSourceUsers = ['Dana'];
const zeroOverrideSourceSubscriptions = {
  Dana: {
    lunch: [
      { id: 'LUNCH_BASE', name: 'Override Lunch Base', weight: 1 },
      { id: 'LUNCH_OVERRIDE', name: 'Override Lunch Alt', weight: 1 }
    ],
    snack: []
  }
};
const zeroOverrideSourceEatingDays = {
  Dana: {
    lunch: { days: ['Monday'], slots: [['Monday']] },
    snack: { days: ['Monday'], slots: [['Monday']] }
  }
};
const zeroOverrideSourceMealsPerDay = {
  lunch: 1,
  snack: 0
};
const zeroOverrideSourceOverrides = {
  Dana: {
    Monday: {
      snack: {
        0: 'lunch'
      }
    }
  }
};

const { calendar: zeroOverrideSourceCalendar } = generateWhatToEatCalendar(
  zeroOverrideSourceUsers,
  {},
  zeroOverrideSourceSubscriptions,
  zeroOverrideSourceEatingDays,
  zeroOverrideSourceMealsPerDay,
  startDate,
  1,
  {},
  {},
  zeroOverrideSourceOverrides
);

const zeroOverrideSourceMonday = zeroOverrideSourceCalendar.Dana['2024-01-01'];
if (!zeroOverrideSourceMonday) {
  throw new Error('Missing Monday entry for Dana in zero override source test');
}
if (getId(zeroOverrideSourceMonday.lunch) !== 'LUNCH_BASE') {
  throw new Error(
    `Base lunch slot should keep its own meal: ${zeroOverrideSourceMonday.lunch}`
  );
}
if (getId(zeroOverrideSourceMonday.snack) !== 'LUNCH_OVERRIDE') {
  throw new Error(
    `Override slot for zero-multiplier category did not schedule the alternate lunch meal: ${zeroOverrideSourceMonday.snack}`
  );
}

// Scenario: three users share one triple-overlap snack and separate pair overlaps.
// Each user should see their multi-user snacks before their solo snack day occurs.
const intersectionUsers = ['Uma', 'Victor', 'Wendy'];
const tripleSnack = {
  id: 'SNACK_ALL',
  name: 'All Hands Snack',
  weight: 1,
  groupMeal: true
};
const pairUV = { id: 'SNACK_UV', name: 'UV Trail Mix', weight: 1, groupMeal: true };
const pairUW = { id: 'SNACK_UW', name: 'UW Pretzels', weight: 1, groupMeal: true };
const soloU = { id: 'SOLO_U', name: 'Uma Solo Snack', weight: 1 };
const soloV = { id: 'SOLO_V', name: 'Victor Solo Snack', weight: 1 };
const soloW = { id: 'SOLO_W', name: 'Wendy Solo Snack', weight: 1 };

const intersectionSubscriptions = {
  Uma: {
    shared: [tripleSnack],
    pair: [pairUV, pairUW],
    solo: [soloU]
  },
  Victor: {
    shared: [tripleSnack],
    pair: [pairUV],
    solo: [soloV]
  },
  Wendy: {
    shared: [tripleSnack],
    pair: [pairUW],
    solo: [soloW]
  }
};

const intersectionEatingDays = {
  Uma: {
    shared: { days: ['Monday'], slots: [['Monday']] },
    pair: { days: ['Tuesday', 'Wednesday'], slots: [['Tuesday', 'Wednesday']] },
    solo: { days: ['Friday'], slots: [['Friday']] }
  },
  Victor: {
    shared: { days: ['Monday'], slots: [['Monday']] },
    pair: { days: ['Tuesday'], slots: [['Tuesday']] },
    solo: { days: ['Saturday'], slots: [['Saturday']] }
  },
  Wendy: {
    shared: { days: ['Monday'], slots: [['Monday']] },
    pair: { days: ['Wednesday'], slots: [['Wednesday']] },
    solo: { days: ['Sunday'], slots: [['Sunday']] }
  }
};

const intersectionMealsPerDay = { shared: 1, pair: 1, solo: 1 };

const { calendar: intersectionCalendar } = generateWhatToEatCalendar(
  intersectionUsers,
  {},
  intersectionSubscriptions,
  intersectionEatingDays,
  intersectionMealsPerDay,
  startDate,
  1,
  {},
  {},
  {}
);

const orderedIntersectionDays = Object.keys(intersectionCalendar.Uma || {}).sort();
if (!orderedIntersectionDays.length) {
  throw new Error('Expected intersection scenario to generate shared snack days');
}

if (getId(intersectionCalendar.Uma['2024-01-01']?.shared) !== 'SNACK_ALL') {
  throw new Error('Uma should receive the triple-overlap snack on Monday');
}
if (getId(intersectionCalendar.Victor['2024-01-01']?.shared) !== 'SNACK_ALL') {
  throw new Error('Victor should receive the triple-overlap snack on Monday');
}
if (getId(intersectionCalendar.Wendy['2024-01-01']?.shared) !== 'SNACK_ALL') {
  throw new Error('Wendy should receive the triple-overlap snack on Monday');
}
if (getId(intersectionCalendar.Uma['2024-01-02']?.pair) !== 'SNACK_UV') {
  throw new Error('Uma should receive the UV pair snack on Tuesday');
}
if (getId(intersectionCalendar.Victor['2024-01-02']?.pair) !== 'SNACK_UV') {
  throw new Error('Victor should receive the UV pair snack on Tuesday');
}
if (getId(intersectionCalendar.Uma['2024-01-03']?.pair) !== 'SNACK_UW') {
  throw new Error('Uma should receive the UW pair snack on Wednesday');
}
if (getId(intersectionCalendar.Wendy['2024-01-03']?.pair) !== 'SNACK_UW') {
  throw new Error('Wendy should receive the UW pair snack on Wednesday');
}

function ensureSharedBeforeSolo(user, soloId, requiredSharedIds) {
  const timeline = [];
  orderedIntersectionDays.forEach(day => {
    const entry = intersectionCalendar[user]?.[day] || {};
    ['shared', 'pair', 'solo'].forEach(category => {
      const value = entry[category];
      if (Array.isArray(value)) {
        value.forEach(v => {
          const id = getId(v);
          if (id != null) timeline.push({ id, category });
        });
      } else if (value != null) {
        const id = getId(value);
        if (id != null) timeline.push({ id, category });
      }
    });
  });
  const soloIndex = timeline.findIndex(t => t.id === soloId);
  if (soloIndex === -1) {
    throw new Error(`${user} never received solo snack ${soloId}`);
  }
  requiredSharedIds.forEach(sharedId => {
    const idx = timeline.findIndex(t => t.id === sharedId);
    if (idx === -1) {
      throw new Error(`${user} never received shared snack ${sharedId}`);
    }
    if (idx > soloIndex) {
      throw new Error(
        `${user} received solo snack ${soloId} before shared snack ${sharedId}`
      );
    }
  });
}

ensureSharedBeforeSolo('Uma', 'SOLO_U', ['SNACK_ALL', 'SNACK_UV', 'SNACK_UW']);
ensureSharedBeforeSolo('Victor', 'SOLO_V', ['SNACK_ALL', 'SNACK_UV']);
ensureSharedBeforeSolo('Wendy', 'SOLO_W', ['SNACK_ALL', 'SNACK_UW']);

console.log('meal slot override calendar tests passed');

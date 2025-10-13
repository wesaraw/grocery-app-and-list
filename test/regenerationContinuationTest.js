import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

function buildSequentialDays(startStr, count) {
  const start = new Date(startStr);
  const days = [];
  for (let i = 0; i < count; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    days.push(current.toISOString().split('T')[0]);
  }
  return days;
}

function extractId(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value.map(extractId);
  }
  if (typeof value === 'object') {
    return value.mealId || value.id || value.name || null;
  }
  return value;
}

function normalizeEntryValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return normalizeEntryValue(value[0]);
  }
  if (typeof value === 'object') {
    const mealId = value.mealId || value.id || value.name || null;
    const type = value.type === 'leftover' ? 'leftover' : 'cook';
    const leftoverTargets = Array.isArray(value.leftoverTargets)
      ? value.leftoverTargets.map(target => ({ ...target }))
      : [];
    const leftoverSource =
      value.leftoverSource && typeof value.leftoverSource === 'object'
        ? { ...value.leftoverSource }
        : null;
    return { mealId, type, leftoverTargets, leftoverSource };
  }
  return { mealId: value, type: 'cook', leftoverTargets: [], leftoverSource: null };
}

(function testRegenerationContinuesRotation() {
  const users = ['sam'];
  const prepared = {};
  const meals = [
    { id: 'M1', name: 'Meal 1', weight: 1 },
    { id: 'M2', name: 'Meal 2', weight: 1 },
    { id: 'M3', name: 'Meal 3', weight: 1 }
  ];
  const subscriptions = { sam: { dinner: meals } };
  const eatingDays = {
    sam: {
      dinner: {
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        slots: [['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']]
      }
    }
  };
  const mealsPerDay = { dinner: 1 };
  const startDate = '2024-01-01';

  const firstRun = generateWhatToEatCalendar(
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
    {},
    {}
  );

  const { calendar: firstCalendar, metadata: firstMeta } = firstRun;
  const freezeDate = '2024-01-04';

  const secondRun = generateWhatToEatCalendar(
    users,
    prepared,
    subscriptions,
    eatingDays,
    mealsPerDay,
    freezeDate,
    2,
    {},
    {},
    {},
    {},
    {
      previousCalendar: firstCalendar,
      freezeBefore: freezeDate,
      initialState: firstMeta
    }
  );

  const { calendar: regenerated, metadata: secondMeta } = secondRun;
  const preservedDay = '2024-01-03';

  const preservedOriginal = extractId(firstCalendar.sam[preservedDay]?.dinner);
  const preservedNew = extractId(regenerated.sam[preservedDay]?.dinner);
  if (preservedOriginal !== preservedNew) {
    throw new Error('Regeneration should preserve earlier day assignments');
  }

  const expectedNext = extractId(firstCalendar.sam[freezeDate]?.dinner);
  const regeneratedNext = extractId(regenerated.sam[freezeDate]?.dinner);
  if (expectedNext !== regeneratedNext) {
    throw new Error('Regeneration should continue rotation with next scheduled meal');
  }

  if (secondMeta?.freezeSnapshot?.asOfDate !== freezeDate) {
    throw new Error('Freeze snapshot should track the regeneration cutoff date');
  }
})();

(function testRecencyVariesOrderAcrossWeeks() {
  const users = ['taylor'];
  const prepared = {};
  const meals = [
    { id: 'R1', name: 'Recency 1', weight: 1 },
    { id: 'R2', name: 'Recency 2', weight: 1 },
    { id: 'R3', name: 'Recency 3', weight: 1 }
  ];
  const subscriptions = { taylor: { lunchDinner: meals } };
  const eatingDays = {
    taylor: {
      lunchDinner: {
        days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        slots: [['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']]
      }
    }
  };
  const mealsPerDay = { lunchDinner: 1 };
  const startDate = '2024-02-04'; // Sunday

  const { calendar } = generateWhatToEatCalendar(
    users,
    prepared,
    subscriptions,
    eatingDays,
    mealsPerDay,
    startDate,
    2
  );

  const allDays = buildSequentialDays(startDate, 14);
  const firstWeek = allDays.slice(0, 7).map(date => extractId(calendar.taylor[date]?.lunchDinner));
  const secondWeek = allDays
    .slice(7, 14)
    .map(date => extractId(calendar.taylor[date]?.lunchDinner));

  if (JSON.stringify(firstWeek) === JSON.stringify(secondWeek)) {
    throw new Error('Recency logic should alter the order of meals across weeks');
  }
})();

(function testRecencyRespectsConstraints() {
  const users = ['jordan'];
  const prepared = {};
  const lunchDinnerMeals = [
    {
      id: 'LD1',
      name: 'Leftover Stew',
      weight: 1,
      leftoverOk: true,
      ingredients: [{ name: 'root-veg' }]
    },
    {
      id: 'LD2',
      name: 'Quick Stir Fry',
      weight: 1,
      ingredients: [{ name: 'greens' }]
    },
    {
      id: 'LD3',
      name: 'Premium Roast',
      weight: 1,
      totalCost: 55,
      ingredients: [{ name: 'prime-roast' }]
    },
    {
      id: 'LD4',
      name: 'Summer Salad',
      weight: 1,
      ingredients: [{ name: 'summer-herb' }]
    },
    {
      id: 'LD5',
      name: 'Hearty Beans',
      weight: 1,
      ingredients: [{ name: 'beans' }]
    }
  ];
  const breakfastMeals = [{ id: 'BR1', name: 'Breakfast Hash', weight: 1 }];
  const subscriptions = {
    jordan: {
      lunchDinner: lunchDinnerMeals,
      breakfast: breakfastMeals
    }
  };
  const eatingDays = {
    jordan: {
      lunchDinner: {
        days: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday'
        ],
        slots: [
          [
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
            'Sunday'
          ]
        ],
        prepSlots: [['Tuesday']]
      },
      breakfast: {
        days: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday'
        ],
        slots: [
          [
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
            'Sunday'
          ]
        ]
      }
    }
  };
  const mealsPerDay = { lunchDinner: 1, breakfast: 1 };
  const startDate = '2024-01-01';
  const priceThresholds = { jordan: 40 };
  const itemSeasons = {
    'summer-herb': [{ start: '2024-06-01', end: '2024-08-31' }]
  };
  const slotOverrides = {
    jordan: {
      Wednesday: {
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
    2,
    priceThresholds,
    itemSeasons,
    slotOverrides
  );

  const allDays = buildSequentialDays(startDate, 14);
  const jordanCal = calendar.jordan || {};

  function ensureFilteredAbsence(entry) {
    if (!entry) return;
    if (entry.mealId === 'LD3' || entry.mealId === 'LD4') {
      throw new Error('Filtered meals should not be scheduled by price/season gates');
    }
  }

  allDays.forEach(date => {
    const normalized = normalizeEntryValue(jordanCal[date]?.lunchDinner);
    ensureFilteredAbsence(normalized);
  });

  const week1Wednesday = normalizeEntryValue(jordanCal['2024-01-03']?.lunchDinner);
  if (!week1Wednesday || week1Wednesday.mealId !== 'BR1') {
    throw new Error('Override day should draw from breakfast category in week 1');
  }
  const week2Wednesday = normalizeEntryValue(jordanCal['2024-01-10']?.lunchDinner);
  if (!week2Wednesday || week2Wednesday.mealId !== 'BR1') {
    throw new Error('Override day should draw from breakfast category in week 2');
  }

  const mondayPrep = normalizeEntryValue(jordanCal['2024-01-01']?.lunchDinner);
  if (
    !mondayPrep ||
    mondayPrep.type !== 'cook' ||
    !Array.isArray(mondayPrep.leftoverTargets) ||
    !mondayPrep.leftoverTargets.some(target => target?.date === '2024-01-02')
  ) {
    throw new Error('Monday cook entry should register a leftover target for Tuesday');
  }

  function assertLeftoverDay(date, expectedSource) {
    const normalized = normalizeEntryValue(jordanCal[date]?.lunchDinner);
    if (!normalized || normalized.type !== 'leftover') {
      throw new Error(`Expected ${date} to consume leftovers`);
    }
    if (!normalized.leftoverSource || normalized.leftoverSource.date !== expectedSource) {
      throw new Error(`Leftover on ${date} should reference ${expectedSource}`);
    }
  }

  assertLeftoverDay('2024-01-02', '2024-01-01');

  function collectCookSequence(days) {
    return days
      .map(date => normalizeEntryValue(jordanCal[date]?.lunchDinner))
      .filter(entry => entry && entry.type === 'cook' && /^LD/.test(entry.mealId))
      .map(entry => entry.mealId);
  }

  const firstWeekCook = collectCookSequence(allDays.slice(0, 7));
  const secondWeekCook = collectCookSequence(allDays.slice(7, 14));

  if (
    firstWeekCook.length &&
    secondWeekCook.length &&
    JSON.stringify(firstWeekCook) === JSON.stringify(secondWeekCook)
  ) {
    throw new Error('Recency logic should vary meal order even under constraints');
  }
})();

console.log('regeneration continuation tests passed');

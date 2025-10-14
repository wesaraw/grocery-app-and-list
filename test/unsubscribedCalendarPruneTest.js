import {
  generateWhatToEatCalendar,
  buildAllowedMealLookup,
  filterCalendarDayByAllowedMeals
} from '../utils/whatToEatCalendar.js';
import { aggregateCalendar } from '../utils/calendarUtils.js';

const users = ['Val'];
const freezeBefore = '2024-10-10';
const startDate = new Date('2024-10-10T00:00:00Z');
const mealsPerDay = { breakfast: 1 };

const subscriptions = {
  Val: { breakfast: [] }
};

const eatingDays = {
  Val: {
    breakfast: {
      days: ['Monday'],
      slots: [['Monday']]
    }
  }
};

const previousCalendar = {
  Val: {
    '2024-10-09': {
      breakfast: ['GhostMeal']
    }
  }
};

const rebuildResult = generateWhatToEatCalendar(
  users,
  {},
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1,
  {},
  {},
  {},
  {},
  {
    previousCalendar,
    freezeBefore,
    initialState: null
  }
);

const preservedGhostDay = rebuildResult.calendar.Val['2024-10-09'];
if (preservedGhostDay !== undefined) {
  throw new Error('expected unsubscribed meal to be pruned during rebuild');
}

const resyncResult = generateWhatToEatCalendar(
  users,
  {},
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1,
  {},
  {},
  {},
  {},
  {
    previousCalendar: {},
    freezeBefore,
    initialState: null
  }
);

const allowedLookup = buildAllowedMealLookup(subscriptions);
const mergedCalendar = {};
users.forEach(user => {
  const allowedForUser = allowedLookup[user] || null;
  const nextEntries = { ...(resyncResult.calendar[user] || {}) };
  const prevEntries = previousCalendar[user] || {};
  Object.entries(prevEntries).forEach(([dateStr, dayValue]) => {
    if (dateStr < freezeBefore && nextEntries[dateStr] === undefined) {
      const filtered = filterCalendarDayByAllowedMeals(dayValue, allowedForUser);
      if (filtered && Object.keys(filtered).length) {
        nextEntries[dateStr] = filtered;
      }
    }
  });
  mergedCalendar[user] = nextEntries;
});

if (mergedCalendar.Val['2024-10-09'] !== undefined) {
  throw new Error('expected resync merge to ignore unsubscribed meal history');
}

const mealsByCategory = {
  breakfast: [
    {
      id: 'GhostMeal',
      name: 'GhostMeal',
      ingredients: [{ name: 'Ghost Item', amount: '1 ea' }],
      prepared: false,
      groupMeal: false
    }
  ]
};

const aggregatedNeeds = aggregateCalendar(mergedCalendar, mealsByCategory);
if (aggregatedNeeds.has('Ghost Item')) {
  throw new Error('unsubscribed meal should not contribute to aggregated needs');
}

console.log('unsubscribed calendar prune test passed');

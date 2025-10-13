import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['Becky', 'Val', 'Wes', 'Merrilynn'];
const freezeBefore = '2024-01-05';
const startDate = new Date('2024-01-05T00:00:00Z');

function buildBreakfastMeals() {
  const ids = ['B1', 'B2', 'B3', 'B4'];
  return ids.map(id => ({ id, weight: 1, prepared: false, groupMeal: false }));
}

function buildSubscriptions(meals) {
  const subs = {};
  users.forEach(user => {
    subs[user] = { breakfast: meals };
  });
  return subs;
}

function buildEatingDays() {
  const eatingDays = {};
  users.forEach(user => {
    eatingDays[user] = {
      breakfast: { days: ['Monday'], slots: [['Monday']] }
    };
  });
  return eatingDays;
}

function buildPreviousCalendar() {
  const prev = {};
  users.forEach((user, idx) => {
    prev[user] = {
      '2024-01-01': { breakfast: [{ mealId: `PA${idx}` }] },
      '2024-01-02': { breakfast: [{ mealId: `PB${idx}` }] },
      '2024-01-03': { breakfast: [{ mealId: `PC${idx}` }] },
      '2024-01-04': { breakfast: [{ mealId: `PD${idx}` }] }
    };
  });
  return prev;
}

function buildInitialState() {
  const state = {};
  users.forEach((user, idx) => {
    const mealId = `B${idx + 1}`;
    state[user] = { breakfast: { B1: 0, B2: 0, B3: 0, B4: 0 } };
    state[user].breakfast[mealId] = 5;
  });
  return {
    freezeSnapshot: {
      asOfDate: freezeBefore,
      nonPrepState: state,
      sharedGroupState: {},
      leftoverCarry: {},
      recencyState: {}
    }
  };
}

function mergeCalendars(previousCalendar, nextCalendar, cutoffDate, userList) {
  const merged = {};
  userList.forEach(user => {
    const nextEntries = { ...(nextCalendar[user] || {}) };
    const prevEntries = previousCalendar[user] || {};
    Object.entries(prevEntries).forEach(([dateStr, dayValue]) => {
      if (!cutoffDate || dateStr < cutoffDate) {
        if (nextEntries[dateStr] === undefined) {
          nextEntries[dateStr] = dayValue;
        }
      }
    });
    merged[user] = nextEntries;
  });
  Object.keys(previousCalendar).forEach(prevUser => {
    if (merged[prevUser]) return;
    const prevEntries = previousCalendar[prevUser] || {};
    const mergedEntries = {};
    Object.entries(prevEntries).forEach(([dateStr, dayValue]) => {
      if (!cutoffDate || dateStr < cutoffDate) {
        mergedEntries[dateStr] = dayValue;
      }
    });
    merged[prevUser] = mergedEntries;
  });
  return merged;
}

function resolveBreakfastId(dayValue) {
  if (!dayValue) return null;
  const slot = dayValue.breakfast;
  if (Array.isArray(slot)) {
    const first = slot[0];
    if (first == null) return null;
    if (typeof first === 'string') return first;
    if (typeof first === 'object') {
      return first.mealId || first.id || null;
    }
    return null;
  }
  if (slot == null) return null;
  if (typeof slot === 'string') return slot;
  if (typeof slot === 'object') {
    return slot.mealId || slot.id || null;
  }
  return null;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const breakfastMeals = buildBreakfastMeals();
const subscriptions = buildSubscriptions(breakfastMeals);
const eatingDays = buildEatingDays();
const mealsPerDay = { breakfast: 1 };
const previousCalendar = buildPreviousCalendar();
const initialState = buildInitialState();

const driftResult = generateWhatToEatCalendar(
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
    initialState
  }
);

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

const driftBreakfasts = users.map(user =>
  resolveBreakfastId(driftResult.calendar[user]['2024-01-08'])
);
const driftUnique = new Set(driftBreakfasts.filter(Boolean));
assert(
  driftUnique.size > 1,
  `expected drift before resync, but assignments were ${driftBreakfasts.join(', ')}`
);

const mergedResyncCalendar = mergeCalendars(
  previousCalendar,
  resyncResult.calendar,
  freezeBefore,
  users
);

const preservedDate = '2024-01-03';
users.forEach(user => {
  const mergedDay = mergedResyncCalendar[user][preservedDate];
  const prevDay = previousCalendar[user][preservedDate];
  assert(
    JSON.stringify(mergedDay) === JSON.stringify(prevDay),
    `expected history for ${user} on ${preservedDate} to be preserved`
  );
});

const resyncBreakfasts = users.map(user =>
  resolveBreakfastId(mergedResyncCalendar[user]['2024-01-08'])
);
const resyncUnique = new Set(resyncBreakfasts.filter(Boolean));
assert(
  resyncUnique.size === 1,
  `expected resync to unify breakfasts, but assignments were ${resyncBreakfasts.join(', ')}`
);

console.log('what to eat resync test passed');

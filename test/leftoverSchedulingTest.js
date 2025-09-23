import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['Casey'];
const startDate = '2023-01-02';
const preparedCal = {};

const leftoverMeals = [
  { id: 'LEFT_OK', name: 'Leftover Friendly', leftoverOk: true, weight: 1 }
];

const leftoverSubscriptions = { Casey: { lunchDinner: leftoverMeals } };

const leftoverEatingDays = {
  Casey: {
    lunchDinner: {
      days: ['Monday', 'Tuesday'],
      slots: [['Monday', 'Tuesday']],
      prepSlots: [['Tuesday']]
    }
  }
};

const mealsPerDay = { lunchDinner: 1 };

const leftoverCalendar = generateWhatToEatCalendar(
  users,
  preparedCal,
  leftoverSubscriptions,
  leftoverEatingDays,
  mealsPerDay,
  startDate,
  1
);

const mondayEntry = leftoverCalendar.Casey['2023-01-02']?.lunchDinner;
const tuesdayEntry = leftoverCalendar.Casey['2023-01-03']?.lunchDinner;

if (!mondayEntry || !tuesdayEntry) {
  throw new Error('Missing lunch/dinner entries for leftover scenario');
}

const normalize = value =>
  value && typeof value === 'object' ? value : { mealId: value, type: 'cook', leftoverTargets: [] };

const mondayNormalized = normalize(mondayEntry);
const tuesdayNormalized = normalize(tuesdayEntry);

if (mondayNormalized.mealId !== 'LEFT_OK') {
  throw new Error(`Expected Monday to cook leftover meal, saw ${mondayNormalized.mealId}`);
}
if (!Array.isArray(mondayNormalized.leftoverTargets) || mondayNormalized.leftoverTargets.length !== 1) {
  throw new Error('Monday cook entry should register a single leftover target');
}
if (mondayNormalized.leftoverTargets[0]?.date !== '2023-01-03') {
  throw new Error('Leftover target should point to Tuesday');
}
if (tuesdayNormalized.type !== 'leftover') {
  throw new Error(`Tuesday should be scheduled as leftover, saw type ${tuesdayNormalized.type}`);
}
if (tuesdayNormalized.mealId !== 'LEFT_OK') {
  throw new Error(`Tuesday leftover should reuse Monday meal, saw ${tuesdayNormalized.mealId}`);
}
if (tuesdayNormalized.leftoverSource?.date !== '2023-01-02') {
  throw new Error('Leftover source should reference Monday');
}

const fallbackMeals = [
  { id: 'FRESH_ONLY', name: 'Fresh Meal', leftoverOk: false, prepared: false },
  { id: 'PREPARED_FALLBACK', name: 'Prepared Fallback', prepared: true }
];

const fallbackSubscriptions = { Casey: { lunchDinner: fallbackMeals } };

const fallbackEatingDays = {
  Casey: {
    lunchDinner: {
      days: ['Monday'],
      slots: [['Monday']],
      prepSlots: [['Monday']]
    }
  }
};

const fallbackCalendar = generateWhatToEatCalendar(
  users,
  preparedCal,
  fallbackSubscriptions,
  fallbackEatingDays,
  mealsPerDay,
  startDate,
  1
);

const fallbackEntry = fallbackCalendar.Casey['2023-01-02']?.lunchDinner;
if (!fallbackEntry) {
  throw new Error('Fallback scenario missing Monday entry');
}
const fallbackId = fallbackEntry && typeof fallbackEntry === 'object'
  ? fallbackEntry.mealId
  : fallbackEntry;
if (fallbackId !== 'PREPARED_FALLBACK') {
  throw new Error(`Prep-required day should fall back to prepared meal, saw ${fallbackId}`);
}

console.log('leftover scheduling tests passed');

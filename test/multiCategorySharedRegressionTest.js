import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['u1', 'u2'];
const sharedLunch = { id: 'L_SHARED', groupMeal: true };
const sharedDinner = { id: 'D_SHARED', groupMeal: true };
const sharedSnack = { id: 'S_SHARED', groupMeal: true };

const subscriptions = {
  u1: {
    lunch: [
      sharedLunch,
      { id: 'L_U1_A' },
      { id: 'L_U1_B' }
    ],
    dinner: [
      sharedDinner,
      { id: 'D_U1_A' },
      { id: 'D_U1_B' }
    ],
    snack: [
      sharedSnack,
      { id: 'S_U1_A' },
      { id: 'S_U1_B' }
    ]
  },
  u2: {
    lunch: [
      sharedLunch,
      { id: 'L_U2_A' },
      { id: 'L_U2_B' }
    ],
    dinner: [
      sharedDinner,
      { id: 'D_U2_A' },
      { id: 'D_U2_B' }
    ],
    snack: [
      sharedSnack,
      { id: 'S_U2_A' },
      { id: 'S_U2_B' }
    ]
  }
};

const allDays = ['Monday', 'Tuesday'];
const buildSlots = count => Array.from({ length: count }, () => allDays.slice());

const eatingDays = {
  u1: {
    lunch: { days: allDays.slice(), slots: buildSlots(3) },
    dinner: { days: allDays.slice(), slots: buildSlots(2) },
    snack: { days: allDays.slice(), slots: buildSlots(3) }
  },
  u2: {
    lunch: { days: allDays.slice(), slots: buildSlots(3) },
    dinner: { days: allDays.slice(), slots: buildSlots(2) },
    snack: { days: allDays.slice(), slots: buildSlots(3) }
  }
};

const mealsPerDay = { lunch: 3, dinner: 2, snack: 3 };
const startDate = new Date('2024-01-01');

const { calendar } = generateWhatToEatCalendar(
  users,
  {},
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1
);

const toId = entry => {
  if (entry == null) return null;
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object') {
    if (entry.mealId) return entry.mealId;
    if (entry.id) return entry.id;
  }
  return null;
};

const categories = [
  { key: 'lunch', sharedId: 'L_SHARED', slots: 3 },
  { key: 'dinner', sharedId: 'D_SHARED', slots: 2 },
  { key: 'snack', sharedId: 'S_SHARED', slots: 3 }
];

const dates = ['2024-01-01', '2024-01-02'];

dates.forEach(date => {
  users.forEach(user => {
    const day = calendar[user]?.[date];
    if (!day) {
      throw new Error(`Missing calendar entries for ${user} on ${date}`);
    }
    categories.forEach(({ key, sharedId, slots }) => {
      const value = day[key];
      if (!Array.isArray(value) || value.length !== slots) {
        throw new Error(`Unexpected slot count for ${key} on ${date}`);
      }
      const ids = value.map(toId);
      if (ids.some(id => id == null)) {
        throw new Error(`Slot contained empty assignment for ${key} on ${date}`);
      }
      const sharedUses = ids.filter(id => id === sharedId).length;
      if (sharedUses !== 1) {
        throw new Error(
          `Expected exactly one shared assignment for ${key} on ${date}, saw ${sharedUses}`
        );
      }
      const others = ids.filter(id => id !== sharedId);
      if (others.length !== slots - 1) {
        throw new Error(`Incorrect fallback count for ${key} on ${date}`);
      }
      const uniqueFallbacks = new Set(others);
      if (uniqueFallbacks.size !== others.length) {
        throw new Error(`Fallback meals repeated for ${key} on ${date}`);
      }
    });
  });
});

console.log('multi-category shared regression tests passed');

import { generateWhatToEatCalendar } from '../utils/whatToEatCalendar.js';

const users = ['u1', 'u2'];
const snacks = [{ id: 'S1' }, { id: 'S2' }];
const prepared = {};
const subscriptions = { u1: { snack: snacks }, u2: { snack: snacks } };
const eatingDays = {
  u1: { snack: { days: ['Monday'], slots: [['Monday'], ['Monday']] } },
  u2: { snack: { days: ['Monday'], slots: [['Monday'], ['Monday']] } }
};
const mealsPerDay = { snack: 2 };
const startDate = new Date('2024-01-01');

const cal = generateWhatToEatCalendar(
  users,
  prepared,
  subscriptions,
  eatingDays,
  mealsPerDay,
  startDate,
  1
);

const s1 = cal.u1['2024-01-01'].snack;
const s2 = cal.u2['2024-01-01'].snack;
if (!Array.isArray(s1) || s1.length !== 2) {
  throw new Error('User 1 snack slots missing');
}
if (s1[0] === s1[1]) {
  throw new Error('Snack slots returned same meal');
}
if (s1[0] !== s2[0] || s1[1] !== s2[1]) {
  throw new Error('Users did not share same snack picks');
}

const soloUsers = ['solo'];
const soloSubscriptions = { solo: { snack: snacks } };
const soloEatingDays = {
  solo: { snack: { days: ['Monday'], slots: [[], ['Monday']] } }
};

const soloCal = generateWhatToEatCalendar(
  soloUsers,
  prepared,
  soloSubscriptions,
  soloEatingDays,
  mealsPerDay,
  startDate,
  1
);

const soloSlots = soloCal.solo['2024-01-01'].snack;
if (!Array.isArray(soloSlots) || soloSlots.length !== 2) {
  throw new Error('Solo user snack slots malformed');
}
if (soloSlots[0] != null) {
  throw new Error('Disabled snack slot should be empty');
}
if (!soloSlots[1]) {
  throw new Error('Enabled snack slot should receive a meal');
}
if (!['S1', 'S2'].includes(soloSlots[1])) {
  throw new Error(`Unexpected snack assignment for enabled slot: ${soloSlots[1]}`);
}

console.log('multi snack slot tests passed');

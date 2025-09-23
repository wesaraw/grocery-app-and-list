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

const { calendar: cal } = generateWhatToEatCalendar(
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
const getId = value =>
  value && typeof value === 'object' ? value.mealId || value.id || null : value;
if (!Array.isArray(s1) || s1.length !== 2) {
  throw new Error('User 1 snack slots missing');
}
const s1Ids = s1.map(getId);
if (s1Ids[0] === s1Ids[1]) {
  throw new Error('Snack slots returned same meal');
}
const s2Ids = Array.isArray(s2) ? s2.map(getId) : [getId(s2)];
if (s1Ids[0] !== s2Ids[0] || s1Ids[1] !== s2Ids[1]) {
  throw new Error('Users did not share same snack picks');
}

const soloUsers = ['solo'];
const soloSubscriptions = { solo: { snack: snacks } };
const soloEatingDays = {
  solo: { snack: { days: ['Monday'], slots: [[], ['Monday']] } }
};

const { calendar: soloCal } = generateWhatToEatCalendar(
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
if (soloSlots[0] != null && getId(soloSlots[0]) != null) {
  throw new Error('Disabled snack slot should be empty');
}
if (!soloSlots[1]) {
  throw new Error('Enabled snack slot should receive a meal');
}
const soloId = getId(soloSlots[1]);
if (!['S1', 'S2'].includes(soloId)) {
  throw new Error(`Unexpected snack assignment for enabled slot: ${soloId}`);
}

console.log('multi snack slot tests passed');

import { JSDOM } from 'jsdom';
import { calculatePurchaseNeeds } from '../utils/purchaseCalculator.js';
import { buildItemMap, simulateItem } from '../inventoryTimelineData.js';

global.chrome = {
  storage: {
    local: {
      get: (_keys, cb) => cb({}),
      set: (_value, cb) => (typeof cb === 'function' ? cb() : undefined)
    }
  }
};

const needs = [
  { name: 'Red Onion', home_unit: 'each', total_needed_year: 0 }
];

const consumption = [
  { name: 'red onion', monthly_consumption: 1 }
];

const stock = [
  { name: 'Red Onion', amount: 5, unit: 'each' }
];

const expiration = [
  { name: 'Red Onion', shelf_life_months: 0.5 }
];

const mealsByCategory = {
  dinner: [
    {
      id: 'onionMeal',
      name: 'Onion Meal',
      people: 1,
      ingredients: [{ name: 'Red Onion', serving_size: '1 each' }]
    }
  ]
};

const calendar = { 'User 1': {} };
['2025-01-01', '2025-01-08', '2025-01-29'].forEach(date => {
  calendar['User 1'][date] = { dinner: { mealId: 'onionMeal', type: 'cook' } };
});

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runPurchaseFixture() {
  const currentWeek = 1;
  const result = await calculatePurchaseNeeds(
    needs,
    consumption,
    stock,
    expiration,
    [],
    [],
    {},
    currentWeek,
    calendar,
    mealsByCategory,
    true,
    {},
    null,
    null
  );

  const onion = result.find(item => item.name === 'Red Onion');
  assert(onion, 'Expected onion result from purchase calculator');

  const scheduledWeeks = onion.requiredForScheduledMeals;
  const weeklyUse = onion.weeklyUse;

  assert(scheduledWeeks[currentWeek] === 1, 'Scheduled meal inside runway should be counted');
  assert(
    scheduledWeeks[5] === 0,
    'Meal beyond expiration runway should not contribute to scheduled requirements'
  );
  assert(weeklyUse[currentWeek] > 0, 'Recurring weekly use should be populated');

  return { onion, currentWeek };
}

async function runTimelineFixture(onionDemand, currentWeek) {
  const demandMap = new Map();
  demandMap.set('red onion', {
    weeklyUse: onionDemand.weeklyUse,
    requiredForScheduledMeals: onionDemand.requiredForScheduledMeals
  });

  const items = buildItemMap(
    needs,
    expiration,
    stock,
    consumption,
    [],
    {},
    demandMap,
    currentWeek
  );

  const onionItem = items.find(it => it.name === 'Red Onion');
  assert(onionItem, 'Expected onion in timeline items');

  assert(
    onionItem.weekly_recurring > 0 && onionItem.scheduled_meal_requirements === 2,
    'Timeline item should carry recurring and scheduled demand'
  );

  const weeks = simulateItem(onionItem, {}, currentWeek);
  const week1Qty = weeks[0].rawQty;
  const week2Qty = weeks[1].rawQty;
  const week3Qty = weeks[2].rawQty;

  assert(week1Qty === 5, `Week 1 should start with 5 on hand, got ${week1Qty}`);
  assert(
    week2Qty < week1Qty && week2Qty > 3,
    `Week 2 should reflect recurring draw (~0.23) plus scheduled need (1), got ${week2Qty}`
  );
  assert(
    week3Qty < week2Qty && week3Qty > 2,
    `Week 3 should draw only recurring use after scheduled demand is finished, got ${week3Qty}`
  );

  return onionItem;
}

function renderStatsRow(item) {
  const dom = new JSDOM('<div id="stats"></div>');
  const { document } = dom.window;
  const statsRow = document.getElementById('stats');

  const weeklyBox = document.createElement('div');
  weeklyBox.className = 'stat-box';
  weeklyBox.textContent = `Weekly Use: ${item.weekly_recurring}`;
  statsRow.appendChild(weeklyBox);

  const scheduledBox = document.createElement('div');
  scheduledBox.className = 'stat-box stat-box--scheduled';
  scheduledBox.textContent = `Required for Scheduled Meals: ${item.scheduled_meal_requirements}`;
  statsRow.appendChild(scheduledBox);

  return statsRow;
}

async function runRenderFixture(item) {
  const statsRow = renderStatsRow(item);
  const weeklyLabel = Array.from(statsRow.childNodes).some(node =>
    node.textContent?.includes('Weekly Use')
  );
  const scheduledLabel = Array.from(statsRow.childNodes).some(node =>
    node.textContent?.includes('Required for Scheduled Meals')
  );

  assert(weeklyLabel, 'Weekly Use label should be present');
  assert(scheduledLabel, 'Required for Scheduled Meals label should be present');
}

async function main() {
  const { onion, currentWeek } = await runPurchaseFixture();
  const item = await runTimelineFixture(onion, currentWeek);
  await runRenderFixture(item);
  console.log('scheduledDemandTimelineTest passed');
}

await main();


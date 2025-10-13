import { JSDOM } from 'jsdom';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const dom = new JSDOM(`<!doctype html><body>
    <select id="userSelect"></select>
    <input id="yearInput" />
    <input id="weekInput" />
    <div id="slotColumn"></div>
    <div id="selectedSlotLabel"></div>
    <div id="mealOptions"></div>
    <button id="clearSelectionBtn"></button>
    <button id="saveBtn"></button>
    <div id="statusMessage"></div>
  </body>`, { url: 'http://localhost/' });

  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.chrome = { runtime: { sendMessage: () => {} } };

  const module = await import(new URL('../mealScheduler.js', import.meta.url));
  const { __test } = module;
  const { state, normalizeUserDayPrefs, buildCategoryLabelMaps, refreshSlots, resolveCategoryIdKey } = __test;

  state.users = ['Wes'];
  state.currentUserIndex = 0;
  state.currentYear = 2025;
  state.currentWeek = 38;
  state.slotDescriptorsByCategory = {
    breakfast: [
      { categoryLabel: 'Breakfast', roleLabel: 'Breakfast', slotIndex: 0 }
    ],
    lunchDinner: [
      { categoryLabel: 'Lunch/Dinner', roleLabel: 'Lunch', slotIndex: 0 },
      { categoryLabel: 'Lunch/Dinner', roleLabel: 'Dinner', slotIndex: 1 }
    ]
  };
  state.slotCounts = { breakfast: 1, lunchDinner: 2 };
  state.slotOverridesByUser = {};
  state.weeklyOverrides = [];
  state.slotButtons.clear();
  state.slotMetadata.clear();

  const { labelToId, labelsById } = buildCategoryLabelMaps({ byCategory: state.slotDescriptorsByCategory });
  state.categoryIdByLabel = labelToId;
  state.categoryLabelsById = labelsById;

  const rawPrefs = [
    {
      Breakfast: {
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        slots: [[
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday'
        ]]
      },
      'Lunch/Dinner': {
        days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        slots: [
          ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
        ]
      }
    }
  ];

  state.userDayPrefs = normalizeUserDayPrefs(rawPrefs, 1, {
    resolveCategoryId: key =>
      resolveCategoryIdKey(key, {
        labelLookup: state.categoryIdByLabel,
        descriptorsByCategory: state.slotDescriptorsByCategory
      }),
    labelLookup: state.categoryIdByLabel,
    labelsById: state.categoryLabelsById
  });

  assert(Object.prototype.hasOwnProperty.call(state.userDayPrefs[0], 'breakfast'), 'Breakfast should map to breakfast id');
  assert(Object.prototype.hasOwnProperty.call(state.userDayPrefs[0], 'lunchDinner'), 'Lunch/Dinner should map to lunchDinner id');

  refreshSlots();

  const emptyState = document.querySelector('#slotColumn .empty-state');
  assert(!emptyState, 'Meal Scheduler should render slots when preferences exist');

  const slotButtons = document.querySelectorAll('#slotColumn .slot-btn');
  assert(slotButtons.length >= 7, 'Expected at least one week of slot buttons');

  console.log('meal scheduler label mapping test passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

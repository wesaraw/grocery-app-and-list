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
  const { buildWeekDates } = __test;

  const weekDates = buildWeekDates(2025, 42);
  assert(weekDates.length === 7, 'Week selection should always produce seven day entries');

  const isoDates = weekDates.map(entry => entry.iso);
  assert(
    isoDates[0] === '2025-10-12',
    `Expected week 42 of 2025 to start on 2025-10-12 but received ${isoDates[0]}`
  );
  assert(
    isoDates[isoDates.length - 1] === '2025-10-18',
    `Expected week 42 of 2025 to end on 2025-10-18 but received ${
      isoDates[isoDates.length - 1]
    }`
  );

  console.log('android meal scheduler week selection test passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

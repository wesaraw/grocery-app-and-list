import { renderMultiplier } from '../../src/meal-multiplier/index.js';
import { rebuildCalendars } from '../../src/meal-planner/index.js';

const root = document.getElementById('multiplier');
renderMultiplier(root);

document.getElementById('rebuildCalendars').addEventListener('click', async () => {
  await rebuildCalendars();
});

document.getElementById('viewMealList').addEventListener('click', () => {
  window.location.href = 'mealList.html';
});

document.getElementById('viewCalendar').addEventListener('click', () => {
  window.location.href = 'whatToEatCalendar.html';
});

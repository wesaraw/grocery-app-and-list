import { renderMultiplier } from '../meal-multiplier/index.js';
import { rebuildCalendars } from '../meal-planner/index.js';

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

import { renderCookScheduleView } from '../../src/meal-planner/index.js';

const root = document.getElementById('schedule');
renderCookScheduleView(root);

document.getElementById('mealListPage').addEventListener('click', () => {
  window.location.href = 'mealList.html';
});


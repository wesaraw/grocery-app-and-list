import { renderCookScheduleView } from '../meal-planner/index.js';

const root = document.getElementById('schedule');
renderCookScheduleView(root);

document.getElementById('mealListPage').addEventListener('click', () => {
  window.location.href = 'mealList.html';
});


import { renderCalendarView } from '../../src/meal-planner/index.js';

const root = document.getElementById('calendar');
renderCalendarView(root);

document.getElementById('mealListPage').addEventListener('click', () => {
  window.location.href = 'mealList.html';
});

document.getElementById('editPlanPage').addEventListener('click', () => {
  window.location.href = 'edit-plan.html';
});


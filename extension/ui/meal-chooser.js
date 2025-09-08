import { renderMealChooser } from '../../src/meal-chooser/index.js';

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('mealChooser');
  await renderMealChooser(root);
});

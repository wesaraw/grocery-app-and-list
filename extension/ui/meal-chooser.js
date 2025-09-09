import { renderMealChooser } from '../meal-chooser/index.js';

document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('mealChooser');
  await renderMealChooser(root);
});

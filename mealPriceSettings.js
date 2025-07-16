import { loadMealPriceCap, saveMealPriceCap } from './utils/mealPrice.js';
import { calculateAndSaveMealNeeds } from './utils/mealNeedsCalculator.js';

document.addEventListener('DOMContentLoaded', async () => {
  const input = document.getElementById('priceCap');
  const cap = await loadMealPriceCap();
  if (cap != null) input.value = cap;
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const val = parseFloat(input.value);
    if (!isNaN(val)) await saveMealPriceCap(val);
    else await saveMealPriceCap(null);
    await calculateAndSaveMealNeeds();
    window.close();
  });
});

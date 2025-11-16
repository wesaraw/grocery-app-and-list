import assert from 'assert';
import { normalizeIngredientList } from '../mealime/ingredientNormalizer.js';
import { formatMealimeIngredientsForStorage } from '../mealime/ingredientFormatter.js';
import { updateMealNutritionTotals } from '../utils/mealNutritionCalculator.js';

(function testMealimeIngredientsConvertToGrams() {
  const samples = [
    '1/2 (8 oz) block cheddar cheese',
    '1 (14.5 oz) can fire-roasted tomatoes',
    '1 (15 oz) can kidney beans',
    '0.3 cup brown sugar',
  ];
  const { ingredients } = normalizeIngredientList(samples);
  formatMealimeIngredientsForStorage(ingredients);
  const meal = {
    name: 'Mealime Conversion Test',
    totalPortions: 4,
    ingredients,
  };
  const ingredientMap = {};
  ingredients.forEach(ingredient => {
    ingredientMap[ingredient.name] = {
      perGramVector: { calories: 1 },
    };
  });
  const densityMap = {
    'brown sugar': { convert: true, ratio: 0.85 },
  };
  updateMealNutritionTotals(meal, { ingredientMap, densityMap });
  const conversionFailures = (meal.nutritionTotals?.missingIngredients || [])
    .filter(entry => entry && entry.reason === 'conversion-failed')
    .map(entry => entry.name);
  ['cheddar cheese', 'fire-roasted tomatoes', 'kidney beans', 'brown sugar'].forEach(name => {
    assert(!conversionFailures.includes(name), `Conversion failed for ${name}`);
  });
})();

console.log('mealimeNutritionConversionTest passed');

import { updateMealNutritionTotals } from '../utils/mealNutritionCalculator.js';
import { initUomTable } from '../utils/uomConverter.js';
import { pathToFileURL } from 'url';
import fs from 'fs';

const baseUrl = pathToFileURL(process.cwd() + '/').href;

global.chrome = {
  runtime: {
    getURL: path => new URL(path, baseUrl).href
  }
};

global.fetch = async url => ({
  json: async () => JSON.parse(fs.readFileSync(new URL(url), 'utf8'))
});

await initUomTable();

function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > 1e-3) {
    throw new Error(`${message}: expected ${expected} got ${actual}`);
  }
}

const ingredientMap = {
  'chicken breast': {
    perGramVector: {
      energy: 1,
      protein: 0.31
    },
    portions: []
  },
  'vegetable broth': {
    perGramVector: {
      energy: 0.1,
      protein: 0.02
    },
    portions: []
  },
  'cheddar cheese': {
    perGramVector: {
      energy: 4,
      fat: 0.3
    },
    portions: [
      { amount: 1, measureUnit: 'slice', modifier: '', gramWeight: 28 }
    ]
  },
  water: {
    perGramVector: {},
    portions: []
  }
};

const densityMap = {
  'vegetable broth': { convert: true, ratio: 1 },
  water: { convert: false, ratio: 1 }
};

const meal = {
  name: 'Test Meal',
  totalPortions: 4,
  ingredients: [
    { name: 'Chicken Breast', amount: '200 g' },
    { name: 'Vegetable Broth', amount: '1 cup' },
    { name: 'Cheddar Cheese', amount: '2 slice' },
    { name: 'Water', amount: '100 g' },
    { name: 'Mystery', amount: '1 each' }
  ]
};

const changed = updateMealNutritionTotals(meal, {
  ingredientMap,
  densityMap
});

if (!changed) {
  throw new Error('Expected nutrition totals to change on first calculation');
}

const totals = meal.nutritionTotals;
if (!totals || !totals.perRecipe || !totals.perServing) {
  throw new Error('Missing nutrition totals structure');
}

assertClose(totals.perRecipe.energy, 448.012046, 'Per-recipe energy mismatch');
assertClose(totals.perServing.energy, 112.003012, 'Per-serving energy mismatch');
assertClose(totals.perRecipe.protein, 66.802409, 'Per-recipe protein mismatch');
assertClose(totals.perServing.protein, 16.700602, 'Per-serving protein mismatch');
assertClose(totals.perRecipe.fat, 16.8, 'Per-recipe fat mismatch');
assertClose(totals.perServing.fat, 4.2, 'Per-serving fat mismatch');
assertClose(totals.totalRecipeWeight, 596.120461, 'Total recipe weight mismatch');
assertClose(totals.totalServingWeight, 149.030115, 'Total serving weight mismatch');

if (!Array.isArray(totals.missingIngredients) || totals.missingIngredients.length !== 2) {
  throw new Error('Expected two missing ingredients');
}

const [missingWater, missingMystery] = totals.missingIngredients;
if (missingWater.name !== 'Water' || missingWater.reason !== 'missing-nutrient-data') {
  throw new Error('Water missing data not recorded correctly');
}
if (missingMystery.name !== 'Mystery' || missingMystery.reason !== 'missing-ingredient-record') {
  throw new Error('Mystery ingredient missing record not flagged');
}

const updatedAt = totals.updatedAt;
const unchanged = updateMealNutritionTotals(meal, {
  ingredientMap,
  densityMap
});

if (unchanged) {
  throw new Error('Recalculating without changes should not update totals');
}

if (meal.nutritionTotals.updatedAt !== updatedAt) {
  throw new Error('updatedAt changed despite no nutrition update');
}

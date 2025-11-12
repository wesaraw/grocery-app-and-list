import { updateMealNutritionTotals } from '../utils/mealNutritionCalculator.js';
import { initUomTable } from '../utils/uomConverter.js';
import {
  convertNutrientValueToDisplay,
  NUTRIENT_DEFINITIONS,
  formatDisplayValue
} from '../utils/fdcNutrientMap.js';
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
  'red bell pepper': {
    perGramVector: {
      energy: 0.5,
      vitamin_b1: 0.0006
    },
    portions: [
      { amount: 1, measureUnit: 'peppers', modifier: 'red bell', gramWeight: 85 }
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
    { name: 'Red Bell Pepper', amount: '0.5 each' },
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

assertClose(totals.perRecipe.energy, 469.262046, 'Per-recipe energy mismatch');
assertClose(totals.perServing.energy, 117.315512, 'Per-serving energy mismatch');
assertClose(totals.perRecipe.protein, 66.802409, 'Per-recipe protein mismatch');
assertClose(totals.perServing.protein, 16.700602, 'Per-serving protein mismatch');
assertClose(totals.perRecipe.fat, 16.8, 'Per-recipe fat mismatch');
assertClose(totals.perServing.fat, 4.2, 'Per-serving fat mismatch');
assertClose(totals.totalRecipeWeight, 638.620461, 'Total recipe weight mismatch');
assertClose(totals.totalServingWeight, 159.655115, 'Total serving weight mismatch');
assertClose(totals.perRecipe.vitamin_b1, 0.0255, 'Per-recipe vitamin B1 mismatch');
assertClose(totals.perServing.vitamin_b1, 0.006375, 'Per-serving vitamin B1 mismatch');

const pepperGrams = totals.perRecipe.vitamin_b1 / ingredientMap['red bell pepper'].perGramVector.vitamin_b1;
assertClose(pepperGrams, 42.5, 'Derived gram weight for red bell pepper mismatch');

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

const thiamineDefinition = NUTRIENT_DEFINITIONS.find(def => def.key === 'vitamin_b1');
if (!thiamineDefinition) {
  throw new Error('Expected vitamin B1 definition to be present');
}

const thiamineDisplay = convertNutrientValueToDisplay(0.00006, thiamineDefinition);
if (Math.abs(thiamineDisplay - 0.06) > 1e-6) {
  throw new Error(`Vitamin B1 conversion mismatch: expected 0.06 got ${thiamineDisplay}`);
}

const formattedThiamine = formatDisplayValue(
  thiamineDisplay,
  thiamineDefinition.displayUnit,
  thiamineDefinition.decimals
);

if (!formattedThiamine.includes('0.06')) {
  throw new Error(`Expected formatted thiamine string to include 0.06, got ${formattedThiamine}`);
}

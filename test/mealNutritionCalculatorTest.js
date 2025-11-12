import { updateMealNutritionTotals } from '../utils/mealNutritionCalculator.js';
import { initUomTable } from '../utils/uomConverter.js';
import {
  convertNutrientValueToDisplay,
  NUTRIENT_DEFINITIONS,
  formatDisplayValue
} from '../utils/fdcNutrientMap.js';
import { normalizeIngredientRecord } from '../utils/ingredientStorage.js';
import { canonicalName } from '../utils/nameUtils.js';
import { pathToFileURL } from 'url';
import fs from 'fs';
import { loadGlobalProduceMeasures } from '../utils/unitResolver.js';

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
const globalDefaults = await loadGlobalProduceMeasures();

function assertClose(actual, expected, message) {
  if (Math.abs(actual - expected) > 1e-3) {
    throw new Error(`${message}: expected ${expected} got ${actual}`);
  }
}

const legacyRecord = normalizeIngredientRecord({
  perGramVector: { energy: 0.5 },
  portions: [
    { amount: 1, measureUnit: 'each', modifier: 'medium pepper', gramWeight: 120 }
  ],
  last_checked_at: '2024-01-01T00:00:00.000Z'
});

if (!Array.isArray(legacyRecord.measures) || legacyRecord.measures.length !== 1) {
  throw new Error('Legacy portion record did not migrate to measures');
}

const migratedMeasure = legacyRecord.measures[0];
if (migratedMeasure.grams !== 120 || migratedMeasure.source !== 'fdc:portion') {
  throw new Error('Migrated measure missing grams or source metadata');
}

const ingredientMap = {
  'chicken breast': {
    perGramVector: {
      energy: 1,
      protein: 0.31
    },
    measures: []
  },
  'cheddar cheese': {
    perGramVector: {
      energy: 4,
      fat: 0.3
    },
    measures: [
      {
        label: 'slice',
        unit: 'slice',
        qty: 1,
        grams: 28,
        source: 'fdc:portion',
        confidence: 'high',
        sizeTag: null,
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    ]
  },
  tortilla: {
    perGramVector: {
      energy: 3
    },
    measures: [],
    metadata: {
      packCount: 6,
      sizeQty: 12,
      sizeUnit: 'oz'
    }
  },
  'custom bun': {
    perGramVector: {
      energy: 2
    },
    measures: [
      {
        label: 'Bun',
        unit: 'each',
        qty: 1,
        grams: 75,
        source: 'local',
        confidence: 'high',
        sizeTag: 'medium',
        updatedAt: '2024-06-01T00:00:00.000Z'
      }
    ]
  },
  'red bell pepper': {
    perGramVector: {
      energy: 0.5,
      vitamin_b1: 0.0006
    },
    measures: []
  },
  'vegetable broth': {
    perGramVector: {
      energy: 0.1
    },
    measures: []
  },
  water: {
    perGramVector: {},
    measures: []
  },
  'mystery herb': {
    perGramVector: {
      energy: 0.2
    },
    measures: []
  }
};

const densityMap = {
  'vegetable broth': { convert: true, ratio: 1 },
  water: { convert: false, ratio: 1 }
};

const persistedMeasures = [];

const meal = {
  name: 'Resolver Test Meal',
  totalPortions: 4,
  ingredients: [
    { name: 'Chicken Breast', amount: '200 g' },
    { name: 'Cheddar Cheese', amount: '2 slice' },
    { name: 'Tortilla', amount: '3 each' },
    { name: 'Custom Bun', amount: '2 each' },
    { name: 'Red Bell Pepper', amount: '0.5 each' },
    { name: 'Vegetable Broth', amount: '1 cup' },
    { name: 'Water', amount: '100 g' },
    { name: 'Mystery Herb', amount: '1 each' }
  ]
};

const changed = updateMealNutritionTotals(meal, {
  ingredientMap,
  densityMap,
  globalProduceMeasures: globalDefaults,
  promptForMeasure: () => ({ grams: 10, label: 'user estimate', confidence: 'medium' }),
  persistResolvedMeasure: data => {
    persistedMeasures.push(data);
    if (data?.ingredient?.name && data.measure) {
      const key = canonicalName(data.ingredient.name);
      const record = ingredientMap[key] || ingredientMap[data.ingredient.name.toLowerCase()];
      if (record) {
        record.measures = Array.isArray(record.measures) ? record.measures : [];
        const duplicate = record.measures.find(
          existing =>
            existing &&
            existing.unit === data.measure.unit &&
            Math.abs((existing.grams || 0) - (data.measure.grams || 0)) < 1e-6 &&
            existing.source === data.measure.source
        );
        if (!duplicate) {
          record.measures.push({ ...data.measure });
        }
      }
    }
  }
});

if (!changed) {
  throw new Error('Expected nutrition totals to change on first calculation');
}

const totals = meal.nutritionTotals;
if (!totals || !totals.perRecipe || !totals.perServing) {
  throw new Error('Missing nutrition totals structure');
}

const resolved = totals.resolvedIngredients;
if (!resolved) {
  throw new Error('Resolved ingredient metadata not captured');
}

const chickenMeta = resolved['Chicken Breast'];
if (!chickenMeta || chickenMeta.source !== 'unit:mass') {
  throw new Error('Mass-based resolution missing for chicken breast');
}
assertClose(chickenMeta.grams, 200, 'Chicken grams mismatch');

const cheddarMeta = resolved['Cheddar Cheese'];
if (!cheddarMeta || cheddarMeta.source !== 'fdc:portion') {
  throw new Error('FDC resolution missing for cheddar');
}
assertClose(cheddarMeta.grams, 56, 'Cheddar grams mismatch');

const tortillaMeta = resolved.Tortilla;
if (!tortillaMeta || tortillaMeta.source !== 'label') {
  throw new Error('Label-based resolution missing for tortilla');
}
assertClose(tortillaMeta.grams, 170.095, 'Tortilla grams mismatch');

const bunMeta = resolved['Custom Bun'];
if (!bunMeta || bunMeta.source !== 'local') {
  throw new Error('Local measure resolution missing for custom bun');
}
assertClose(bunMeta.grams, 150, 'Custom bun grams mismatch');

const pepperMeta = resolved['Red Bell Pepper'];
if (!pepperMeta || pepperMeta.source !== 'global') {
  throw new Error('Global default resolution missing for red bell pepper');
}
assertClose(pepperMeta.grams, 60, 'Red bell pepper grams mismatch');

const brothMeta = resolved['Vegetable Broth'];
if (!brothMeta || brothMeta.source !== 'density') {
  throw new Error('Density resolution missing for vegetable broth');
}

const herbMeta = resolved['Mystery Herb'];
if (!herbMeta || herbMeta.source !== 'user') {
  throw new Error('User-supplied resolution missing for mystery herb');
}
assertClose(herbMeta.grams, 10, 'Mystery herb grams mismatch');

if (!Array.isArray(totals.missingIngredients) || totals.missingIngredients.length !== 1) {
  throw new Error('Expected exactly one missing ingredient');
}

const [missingWater] = totals.missingIngredients;
if (missingWater.name !== 'Water' || missingWater.reason !== 'missing-nutrient-data') {
  throw new Error('Water missing nutrient data not recorded correctly');
}

if (!persistedMeasures.some(entry => entry?.measure?.source === 'label')) {
  throw new Error('Package math resolution did not persist label measure');
}
if (!persistedMeasures.some(entry => entry?.measure?.source === 'global')) {
  throw new Error('Global default resolution did not persist measure');
}

const portionCount = totals.portionCount;
if (portionCount !== 4) {
  throw new Error(`Portion count mismatch: expected 4 got ${portionCount}`);
}

const totalWeight = totals.totalRecipeWeight;
if (!(totalWeight > 0)) {
  throw new Error('Total recipe weight not computed');
}

const perRecipeEnergy = totals.perRecipe.energy;
if (!(perRecipeEnergy > 0)) {
  throw new Error('Per-recipe energy missing');
}

const perServingEnergy = totals.perServing.energy;
assertClose(perServingEnergy * portionCount, perRecipeEnergy, 'Per-serving energy mismatch');

const updatedAt = totals.updatedAt;
const unchanged = updateMealNutritionTotals(meal, {
  ingredientMap,
  densityMap,
  globalProduceMeasures: globalDefaults
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
if (formattedThiamine !== '0.06 mg') {
  throw new Error(`Vitamin B1 formatting mismatch: expected 0.06 mg got ${formattedThiamine}`);
}

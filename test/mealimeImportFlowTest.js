import fs from 'fs';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'url';

const { window: parserWindow } = new JSDOM('<!DOCTYPE html>');
global.DOMParser = parserWindow.DOMParser;

const storage = {
  users: ['Test User'],
  yearlyNeeds: [
    {
      name: 'pkgsbaby arugula',
      total_needed_year: 52,
      home_unit: 'oz',
      treat_as_whole_unit: false,
      category: 'produce'
    }
  ],
  monthlyConsumption: [
    { name: 'pkgsbaby arugula', monthly_consumption: 4, unit: 'oz' }
  ],
  currentStock: [
    { name: 'pkgsbaby arugula', amount: 0, unit: 'oz' }
  ],
  expirationData: [
    { name: 'pkgsbaby arugula', shelf_life_months: 4 }
  ],
  consumedThisYear: [
    { name: 'pkgsbaby arugula', amount: 0, unit: 'oz' }
  ],
  purchases: {},
  densityRatios: {},
  itemSeasons: {},
  itemNameMap: {
    'pkgsbaby arugula': '10',
    'red onion': '20',
    'flour tortillas': '21'
  },
  pendingIngredientMatches: {}
};

global.chrome = {
  runtime: {
    getURL: path => pathToFileURL(`${process.cwd()}/${path}`).href
  },
  storage: {
    local: {
      get: (keys, cb) => {
        if (typeof keys === 'string') {
          cb({ [keys]: storage[keys] });
          return;
        }
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(key => {
            result[key] = storage[key];
          });
          cb(result);
          return;
        }
        cb(storage);
      },
      set: (items, cb) => {
        Object.assign(storage, items);
        if (typeof cb === 'function') cb();
      },
      remove: (keys, cb) => {
        if (Array.isArray(keys)) {
          keys.forEach(key => {
            delete storage[key];
          });
        } else if (typeof keys === 'string') {
          delete storage[keys];
        }
        if (typeof cb === 'function') cb();
      }
    }
  }
};

global.fetch = async url => {
  let fileUrl;
  try {
    fileUrl = new URL(url);
  } catch (error) {
    fileUrl = pathToFileURL(`${process.cwd()}/${url}`);
  }
  const contents = fs.readFileSync(fileUrl, 'utf8');
  return {
    json: async () => JSON.parse(contents)
  };
};

import { parseMealimeDocument } from '../mealime/pageParser.js';
import { normalizeIngredientList } from '../mealime/ingredientNormalizer.js';
import { mergeStepQuantities } from '../mealime/stepQuantityMerger.js';
import { formatMealimeIngredientsForStorage } from '../mealime/ingredientFormatter.js';
import {
  backfillIngredientsFromSteps,
  filterResolvedIngredientWarnings,
} from '../mealime/ingredientBackfill.js';
import { importMealFromMealime, __setMealImportTestHooks } from '../mealImport.js';
import { setPendingMatch, getPendingMatch, clearPendingMatches } from '../utils/nutritionMatching.js';

const fixturePath = 'Balsamic Chicken Wrap with Goat Cheese, Cranberries & Lemony Arugula.html';
const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');
const fixtureDom = new JSDOM(fixtureHtml);
const parsed = parseMealimeDocument(fixtureDom.window.document, {
  sourceUrl: 'https://app.mealime.com/recipe_variants/27173/print'
});

const { ingredients, warnings: ingredientWarnings } = normalizeIngredientList(parsed.rawIngredients);
const stepMerge = mergeStepQuantities(parsed.rawSteps, ingredients);
const resolutionMap = backfillIngredientsFromSteps(ingredients, stepMerge.stepQuantities);
formatMealimeIngredientsForStorage(ingredients);
const filteredIngredientWarnings = filterResolvedIngredientWarnings(ingredientWarnings, resolutionMap);
const warningMessages = [
  ...(parsed.warnings || []),
  ...filteredIngredientWarnings
    .map(entry => (entry && entry.reason && entry.ingredient
      ? `Unable to parse ${entry.reason} for "${entry.ingredient}".`
      : null))
    .filter(Boolean),
  ...(stepMerge.warnings || [])
];

const mealData = {
  name: parsed.title,
  category: 'snack',
  ingredients,
  instructions: stepMerge.instructions,
  recipeBook: parsed.time ? `Mealime – ${parsed.time}` : 'Mealime',
  cookTime: parsed.time,
  time: parsed.time,
  sourceUrl: parsed.sourceUrl,
  totalPortions: parsed.servings,
  importWarnings: warningMessages
};

await clearPendingMatches();
const capturedMeals = [];
const nutritionSyncCalls = {};
const stubNutritionSync = async (ingredient, context = {}) => {
  if (!ingredient || !ingredient.name) return;
  const tracker = context.attemptedNames instanceof Set ? context.attemptedNames : null;
  const normalized = ingredient.name.toLowerCase();
  if (tracker) {
    if (tracker.has(normalized)) {
      return;
    }
    tracker.add(normalized);
  }
  nutritionSyncCalls[ingredient.name] = (nutritionSyncCalls[ingredient.name] || 0) + 1;
  if (ingredient.name === 'red onion') {
    await setPendingMatch(ingredient.name, {
      candidates: [{ fdcId: 'test-red-onion', description: 'Red Onion' }],
      unitDefault: ingredient.unit || 'each',
      source: 'meal-import'
    });
    if (Array.isArray(context.warnings)) {
      context.warnings.push('Nutrition data for "red onion" requires confirmation.');
    }
  }
};
__setMealImportTestHooks({
  addMeal: async meal => {
    capturedMeals.push(meal);
  },
  syncNutritionForNewItem: stubNutritionSync,
  skipOriginalNutritionSync: true
});

const summary = await importMealFromMealime(mealData);
__setMealImportTestHooks();

if (capturedMeals.length !== 1) {
  throw new Error('Mealime import did not call addMeal');
}

const savedMeal = capturedMeals[0];
if (savedMeal.name !== 'Balsamic Chicken Wrap with Goat Cheese, Cranberries & Lemony Arugula') {
  throw new Error('Meal name mismatch');
}
if (savedMeal.category !== 'snack') {
  throw new Error('Meal category was not forwarded to addMealHandler');
}
const expectedServings = typeof parsed.servings === 'number' && parsed.servings > 0 ? parsed.servings : 1;
if (savedMeal.totalPortions !== expectedServings) {
  throw new Error(`Expected ${expectedServings} servings but saw ${savedMeal.totalPortions}`);
}
if (!Array.isArray(savedMeal.ingredients) || savedMeal.ingredients.length !== ingredients.length) {
  throw new Error('Structured ingredients were not preserved');
}
if (typeof savedMeal.instructions !== 'string' || savedMeal.instructions.length < 20) {
  throw new Error('Instructions text was not captured correctly');
}
const saltIngredient = savedMeal.ingredients.find(entry => entry.name === 'salt');
if (!saltIngredient) {
  throw new Error('Salt ingredient missing from saved meal');
}
if (saltIngredient.quantity !== 1 || saltIngredient.unit !== 'tsp') {
  throw new Error('Salt quantity/unit were not backfilled from instructions');
}
if (!saltIngredient.derivedFromSteps) {
  throw new Error('Salt ingredient does not indicate it was derived from steps');
}
if (saltIngredient.amount !== '1 tsp') {
  throw new Error('Salt ingredient did not surface its formatted amount string');
}
const warningContainsSalt = warningList =>
  Array.isArray(warningList) && warningList.some(warning => /unable to parse .*salt/i.test(warning));
if (warningContainsSalt(summary.warnings) || warningContainsSalt(savedMeal.importWarnings)) {
  throw new Error('Salt parsing warnings should be cleared once instructions provide measurements');
}
if (summary.name !== savedMeal.name || summary.totalPortions !== savedMeal.totalPortions) {
  throw new Error('Summary metadata mismatch');
}
if (summary.category !== 'snack') {
  throw new Error('Summary did not report the selected meal category');
}
const arugulaEntries = (storage.yearlyNeeds || []).filter(entry => entry.name === 'pkgsbaby arugula');
if (arugulaEntries.length !== 1) {
  throw new Error('Existing inventory ingredient was duplicated during import');
}
const redOnionEntries = (storage.yearlyNeeds || []).filter(entry => entry.name === 'red onion');
if (redOnionEntries.length !== 1) {
  throw new Error('Red onion should have been added to the inventory tables');
}
if (redOnionEntries[0].id !== '20' || storage.itemNameMap['red onion'] !== '20') {
  throw new Error('Red onion did not reuse its serialized inventory ID');
}
const tortillaEntries = (storage.yearlyNeeds || []).filter(entry => entry.name === 'flour tortillas');
if (tortillaEntries.length !== 1) {
  throw new Error('Flour tortillas should have been added to the inventory tables');
}
if (tortillaEntries[0].id !== '21' || storage.itemNameMap['flour tortillas'] !== '21') {
  throw new Error('Flour tortillas did not reuse their serialized inventory ID');
}
const blackPepperEntry = (storage.yearlyNeeds || []).find(entry => entry.name === 'black pepper');
if (!blackPepperEntry) {
  throw new Error('New ingredients were not added to the inventory tables');
}
if (!blackPepperEntry.id || storage.itemNameMap['black pepper'] !== blackPepperEntry.id) {
  throw new Error('Serialized ID for new ingredients was not persisted correctly');
}
const summaryHasWarning = (text) => Array.isArray(summary.warnings)
  && summary.warnings.some(w => /inventory timeline/i.test(w) && w.includes(text));
const mealHasWarning = (text) => Array.isArray(savedMeal.importWarnings)
  && savedMeal.importWarnings.some(w => /inventory timeline/i.test(w) && w.includes(text));
['red onion', 'flour tortillas'].forEach(name => {
  if (!summaryHasWarning(name)) {
    throw new Error(`Summary does not surface the inventory warning for ${name}`);
  }
  if (!mealHasWarning(name)) {
    throw new Error(`Saved meal warnings do not mention ${name}`);
  }
});
if (!Array.isArray(summary.warnings) || !summary.warnings.some(w => /inventory timeline/i.test(w))) {
  throw new Error('Inventory warnings were not surfaced to the summary');
}
if (!Array.isArray(savedMeal.importWarnings) || !savedMeal.importWarnings.some(w => /inventory timeline/i.test(w))) {
  throw new Error('Meal import warnings do not include inventory notices');
}
if ((nutritionSyncCalls['red onion'] || 0) !== 1) {
  throw new Error('Red onion should trigger nutrition sync exactly once');
}
if ((nutritionSyncCalls['flour tortillas'] || 0) !== 1) {
  throw new Error('Flour tortillas should trigger nutrition sync exactly once');
}
if (nutritionSyncCalls['pkgsbaby arugula']) {
  throw new Error('Existing inventory items should not trigger nutrition sync');
}
const pendingRedOnion = await getPendingMatch('red onion');
if (!pendingRedOnion || pendingRedOnion.source !== 'meal-import') {
  throw new Error('Pending nutrition review was not recorded for red onion');
}
if (!Array.isArray(pendingRedOnion.candidates) || !pendingRedOnion.candidates.length) {
  throw new Error('Pending nutrition review for red onion is missing candidates');
}
const summaryHasNutritionWarning = Array.isArray(summary.warnings)
  && summary.warnings.some(w => /red onion/i.test(w) && /nutrition/i.test(w));
if (!summaryHasNutritionWarning) {
  throw new Error('Summary should mention the red onion nutrition confirmation warning');
}
const mealHasNutritionWarning = Array.isArray(savedMeal.importWarnings)
  && savedMeal.importWarnings.some(w => /red onion/i.test(w) && /nutrition/i.test(w));
if (!mealHasNutritionWarning) {
  throw new Error('Saved meal should mention the red onion nutrition confirmation warning');
}

(function testContainerInstructionsDoNotTriggerWarnings() {
  const containerIngredient = {
    name: 'black beans',
    originalText: '1 (15 oz) can black beans',
    quantity: 15,
    unit: 'oz',
    sizeAmount: 15,
    sizeUnit: 'oz',
    sizeUsedAsMeasurement: true,
    containerQuantity: 1,
    containerUnit: 'can',
  };
  const containerSteps = ['Add 1 can black beans to the pot.'];
  const containerMerge = mergeStepQuantities(containerSteps, [containerIngredient]);
  if (containerMerge.warnings.length) {
    throw new Error('Container-based instructions should not emit warnings.');
  }
  if (containerMerge.discrepancies.length) {
    throw new Error('Container-based instructions should not produce discrepancies.');
  }
  if (!Array.isArray(containerMerge.stepQuantities) || !containerMerge.stepQuantities.length) {
    throw new Error('Expected normalized step quantities for container ingredients.');
  }
  const beansStep = containerMerge.stepQuantities[0];
  if (beansStep.unit !== 'oz' || beansStep.quantity !== 15) {
    throw new Error('Container instruction units should be converted to the base unit.');
  }
  const blankIngredient = {
    ...containerIngredient,
    quantity: null,
    unit: null,
  };
  const resolution = backfillIngredientsFromSteps([blankIngredient], containerMerge.stepQuantities);
  if (blankIngredient.quantity !== 15 || blankIngredient.unit !== 'oz') {
    throw new Error('Backfill should capture the normalized quantity/unit from container mentions.');
  }
  const resolutionEntry = resolution.get(containerIngredient.originalText.trim().toLowerCase());
  if (!resolutionEntry || !resolutionEntry.quantity || !resolutionEntry.unit) {
    throw new Error('Resolution map should mark both quantity and unit as resolved for container ingredients.');
  }
})();

await clearPendingMatches();

console.log('mealimeImportFlowTest passed');

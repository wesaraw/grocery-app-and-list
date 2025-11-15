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
  storeSelections: [],
  purchases: {},
  densityRatios: {},
  itemSeasons: {},
  itemNameMap: { 'pkgsbaby arugula': '10' }
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
import { importMealFromMealime, __setMealImportTestHooks } from '../mealImport.js';

const fixturePath = 'Balsamic Chicken Wrap with Goat Cheese, Cranberries & Lemony Arugula.html';
const fixtureHtml = fs.readFileSync(fixturePath, 'utf8');
const fixtureDom = new JSDOM(fixtureHtml);
const parsed = parseMealimeDocument(fixtureDom.window.document, {
  sourceUrl: 'https://app.mealime.com/recipe_variants/27173/print'
});

const { ingredients, warnings: ingredientWarnings } = normalizeIngredientList(parsed.rawIngredients);
const stepMerge = mergeStepQuantities(parsed.rawSteps, ingredients);
const warningMessages = [
  ...(parsed.warnings || []),
  ...ingredientWarnings
    .map(entry => (entry && entry.reason && entry.ingredient
      ? `Unable to parse ${entry.reason} for "${entry.ingredient}".`
      : null))
    .filter(Boolean),
  ...(stepMerge.warnings || [])
];

const mealData = {
  name: parsed.title,
  category: 'lunchDinner',
  ingredients,
  instructions: stepMerge.instructions,
  recipeBook: parsed.time ? `Mealime – ${parsed.time}` : 'Mealime',
  cookTime: parsed.time,
  time: parsed.time,
  sourceUrl: parsed.sourceUrl,
  totalPortions: parsed.servings,
  importWarnings: warningMessages
};

const capturedMeals = [];
__setMealImportTestHooks({
  addMeal: async meal => {
    capturedMeals.push(meal);
  }
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
if (summary.name !== savedMeal.name || summary.totalPortions !== savedMeal.totalPortions) {
  throw new Error('Summary metadata mismatch');
}
const arugulaEntries = (storage.yearlyNeeds || []).filter(entry => entry.name === 'pkgsbaby arugula');
if (arugulaEntries.length !== 1) {
  throw new Error('Existing inventory ingredient was duplicated during import');
}
const blackPepperEntry = (storage.yearlyNeeds || []).find(entry => entry.name === 'black pepper');
if (!blackPepperEntry) {
  throw new Error('New ingredients were not added to the inventory tables');
}
if (!blackPepperEntry.id || storage.itemNameMap['black pepper'] !== blackPepperEntry.id) {
  throw new Error('Serialized ID for new ingredients was not persisted correctly');
}
if (!Array.isArray(summary.warnings) || !summary.warnings.some(w => /inventory timeline/i.test(w))) {
  throw new Error('Inventory warnings were not surfaced to the summary');
}
if (!Array.isArray(savedMeal.importWarnings) || !savedMeal.importWarnings.some(w => /inventory timeline/i.test(w))) {
  throw new Error('Meal import warnings do not include inventory notices');
}

console.log('mealimeImportFlowTest passed');

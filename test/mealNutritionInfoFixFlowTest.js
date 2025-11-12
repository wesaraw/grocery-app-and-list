import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'url';
import fs from 'fs';
import assert from 'node:assert';

const baseUrl = pathToFileURL(process.cwd() + '/').href;

const storageData = {
  mealCategories: [],
  ingredientRecords: {
    'red bell pepper': {
      normalized_name: 'red bell pepper',
      display_name: 'Red Bell Pepper',
      unit_default: 'each',
      perGramVector: { energy: 0.31 },
      measures: [],
      portions: [],
      nutrients: [],
      metadata: {}
    },
    'olive oil': {
      normalized_name: 'olive oil',
      display_name: 'Olive Oil',
      unit_default: 'g',
      perGramVector: { energy: 8.84 },
      measures: [],
      portions: [],
      nutrients: [],
      metadata: {}
    }
  },
  lunchDinnerMeals: [
    {
      id: 'meal-1',
      name: 'Turkey Meatballs with Whole-Wheat Pasta and Marinara',
      totalPortions: 4,
      ingredients: [
        { name: 'Red Bell Pepper', amount: '1 each' },
        { name: 'Olive Oil', amount: '1 cup' }
      ],
      nutritionTotals: {
        version: 1,
        perRecipe: {},
        perServing: {},
        missingIngredients: [
          { name: 'Red Bell Pepper', reason: 'conversion-failed' }
        ],
        resolvedIngredients: {
          'Olive Oil': {
            grams: 240,
            source: 'density:fallback'
          }
        },
        totalRecipeWeight: 0,
        totalServingWeight: 0,
        portionCount: 4,
        updatedAt: '2025-01-01T00:00:00.000Z'
      }
    }
  ],
  densityRatios: {},
  itemNameMap: {
    'Turkey Meatballs with Whole-Wheat Pasta and Marinara': 'meal-1'
  }
};

const storageListeners = [];

function resolveGetResult(keys) {
  if (typeof keys === 'string') {
    return { [keys]: storageData[keys] };
  }
  if (Array.isArray(keys)) {
    const result = {};
    keys.forEach(key => {
      result[key] = storageData[key];
    });
    return result;
  }
  if (keys && typeof keys === 'object') {
    const result = {};
    Object.entries(keys).forEach(([key, defaultValue]) => {
      result[key] = storageData[key] ?? defaultValue;
    });
    return result;
  }
  return { ...storageData };
}

function triggerStorageListeners(changes) {
  if (!changes || !Object.keys(changes).length) return;
  storageListeners.forEach(listener => {
    try {
      listener(changes, 'local');
    } catch (error) {
      console.error('storage listener error', error);
    }
  });
}

global.chrome = {
  runtime: {
    getURL: path => new URL(path, baseUrl).href
  },
  storage: {
    local: {
      get: (keys, callback = () => {}) => {
        setTimeout(() => callback(resolveGetResult(keys)), 0);
      },
      set: (items, callback = () => {}) => {
        setTimeout(() => {
          const changes = {};
          Object.entries(items || {}).forEach(([key, value]) => {
            const oldValue = storageData[key];
            storageData[key] = value;
            changes[key] = { oldValue, newValue: value };
          });
          triggerStorageListeners(changes);
          callback();
        }, 0);
      }
    },
    onChanged: {
      addListener: listener => {
        if (typeof listener === 'function') {
          storageListeners.push(listener);
        }
      }
    }
  }
};

global.fetch = async url => ({
  json: async () => JSON.parse(fs.readFileSync(new URL(url, baseUrl), 'utf8'))
});

const html = fs.readFileSync('mealNutritionInfo.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://example.com/mealNutritionInfo.html?type=lunchDinner&mealId=meal-1'
});

const { window } = dom;
Object.defineProperty(window.document, 'readyState', { value: 'complete', configurable: true });

if (typeof window.HTMLDialogElement !== 'undefined') {
  window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', 'open');
  };
  window.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
}

global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.FormData = window.FormData;
window.chrome = global.chrome;

await import('../mealNutritionInfo.js');

async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

await flush();
await flush();

async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await flush();
  }
  return false;
}

const initialMissingVisible = await waitFor(() => {
  return window.document.querySelectorAll('#missingList li').length === 1;
});

assert.ok(initialMissingVisible, 'Expected one missing ingredient initially');
const missingListBefore = window.document.querySelectorAll('#missingList li');
const fixButton = missingListBefore[0].querySelector('button');
assert.ok(fixButton, 'Missing ingredient should expose a fix button');

fixButton.click();
await flush();

const dialog = window.document.getElementById('fixDialog');
assert.ok(dialog.hasAttribute('open'), 'Fix dialog should open after clicking fix');

const presetRadios = dialog.querySelectorAll('input[name="measureChoice"]');
assert.ok(presetRadios.length > 0, 'Dialog should list preset options from global defaults');
const preferredRadio = Array.from(presetRadios).find(radio => {
  const labelText = radio.parentElement?.textContent || '';
  return /Medium/i.test(labelText);
}) || presetRadios[0];
preferredRadio.checked = true;
preferredRadio.dispatchEvent(new window.Event('change', { bubbles: true }));

const form = window.document.getElementById('fixForm');
form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

await flush();
await flush();

const missingResolved = await waitFor(() => {
  return window.document.querySelectorAll('#missingList li').length === 0;
});

assert.ok(missingResolved, 'Missing ingredient should be resolved after submission');
const missingListAfter = window.document.querySelectorAll('#missingList li');

const resolvedItems = window.document.querySelectorAll('#resolvedList li');
assert.ok(resolvedItems.length >= 2, 'Resolved list should include both ingredients with provenance');
const resolvedNames = Array.from(resolvedItems).map(item => item.firstChild.textContent.trim());
assert.ok(resolvedNames.includes('Red Bell Pepper'), 'Resolved list should include the red bell pepper entry');
const densityItem = Array.from(resolvedItems).find(item => {
  const label = item.firstChild?.textContent?.trim() || '';
  return label.toLowerCase() === 'olive oil';
});
assert.ok(densityItem, 'Resolved list should include the olive oil entry');
const densityMeta = densityItem.querySelector('.resolved-meta');
const densityMetaText = densityMeta?.textContent || '';
assert.ok(densityMetaText.includes('oz'), 'Density fallback entry should display ounce equivalent');
const gramsIndex = densityMetaText.indexOf('g');
const ounceIndex = densityMetaText.indexOf('oz');
assert.ok(
  gramsIndex !== -1 && ounceIndex !== -1 && ounceIndex > gramsIndex,
  'Ounce equivalent should appear after the gram value in the resolved metadata'
);

await flush();

const updatedPepper = storageData.ingredientRecords['red bell pepper'];
assert.ok(updatedPepper, 'Ingredient record should persist red bell pepper data');
assert.ok(
  Array.isArray(updatedPepper.measures) &&
    updatedPepper.measures.some(measure => measure.grams === 120),
  'Red bell pepper record should persist a grams-per-each measure'
);

const savedMeal = storageData.lunchDinnerMeals[0];
assert.ok(savedMeal.nutritionTotals, 'Meal nutrition totals should be saved back to storage');
assert.strictEqual(
  Array.isArray(savedMeal.nutritionTotals.missingIngredients)
    ? savedMeal.nutritionTotals.missingIngredients.length
    : 0,
  0,
  'Persisted meal totals should show no missing ingredients'
);

console.log('mealNutritionInfoFixFlowTest passed');

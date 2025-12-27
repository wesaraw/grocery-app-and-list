import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'url';
import fs from 'fs';
import assert from 'node:assert';

const baseUrl = pathToFileURL(process.cwd() + '/').href;

const storageData = {
  ingredientRecords: {
    couscous: {
      normalized_name: 'couscous',
      display_name: 'Couscous',
      unit_default: 'g',
      nutrients: [
        {
          label: 'Energy',
          displayPerGram: 3.64,
          displayPer100g: 364,
          displayUnit: 'kcal',
          decimals: 2
        }
      ],
      perGramVector: {}
    }
  },
  pendingIngredientMatches: {}
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

global.fetch = async url => {
  const href = typeof url === 'string' ? url : url.href;
  const decodedHref = href.replace(/%20/g, ' ');
  if (decodedHref.endsWith('data/required-for-grocery-app/uom_conversion_table.json')) {
    return {
      json: async () => ({ g: 0.035274, oz: 1 })
    };
  }
  if (href.startsWith(baseUrl)) {
    return {
      json: async () => JSON.parse(fs.readFileSync(new URL(href), 'utf8'))
    };
  }
  throw new Error(`Unexpected fetch request: ${href}`);
};

const html = fs.readFileSync('nutritionInfo.html', 'utf8');
const dom = new JSDOM(html, {
  url: 'https://example.com/nutritionInfo.html?item=Couscous'
});

const { window } = dom;
Object.defineProperty(window.document, 'readyState', { value: 'complete', configurable: true });

global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
window.chrome = global.chrome;

await import('../nutritionInfo.js');

window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

await flush();
await flush();

async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await flush();
  }
  return false;
}

const output = window.document.getElementById('nutritionOutput');
assert.ok(output, 'Nutrition output element should exist');

const updated = await waitFor(() => {
  const value = output.textContent || '';
  return value && value.trim() !== 'Loading…';
});

assert.ok(updated, 'Nutrition output should be populated after loading');

const text = output.textContent || '';
assert.ok(/per oz:/i.test(text), 'Rendered nutrition text should include a per oz segment');

const perUnitIndex = text.indexOf('per g');
const perOzIndex = text.toLowerCase().indexOf('per oz');
const per100Index = text.indexOf('per 100g');
assert.ok(perUnitIndex !== -1, 'Per unit segment should be present for gram-based defaults');
assert.ok(perOzIndex !== -1, 'Per ounce segment should be present');
assert.ok(per100Index !== -1, 'Per 100g segment should be present');
assert.ok(
  perUnitIndex < perOzIndex && perOzIndex < per100Index,
  'Per ounce information should appear after the per unit segment and before per 100g'
);

const expectedPerOz = `per oz: ${(3.64 * 28.349523125).toFixed(2)} kcal`;
assert.ok(
  text.includes(expectedPerOz),
  `Per ounce value should match expected formatting (${expectedPerOz})`
);

// Simulate a volume-based default unit where gramsPerUnit cannot be derived.
const previousText = text;
storageData.ingredientRecords.couscous.unit_default = 'cup';
await new Promise(resolve => {
  chrome.storage.local.set({ ingredientRecords: storageData.ingredientRecords }, resolve);
});

const updatedForVolume = await waitFor(() => {
  const current = output.textContent || '';
  return current && current !== previousText;
});

assert.ok(
  updatedForVolume,
  'Nutrition output should refresh after changing the default unit to a volume value'
);

const volumeText = output.textContent || '';
assert.ok(/per oz:/i.test(volumeText), 'Volume defaults should still include a per oz segment');
const volumePerOzIndex = volumeText.toLowerCase().indexOf('per oz');
const volumePer100Index = volumeText.indexOf('per 100g');
assert.ok(volumePerOzIndex !== -1, 'Per ounce segment should exist for volume defaults');
assert.ok(volumePer100Index !== -1, 'Per 100g segment should exist for volume defaults');
assert.ok(
  volumePerOzIndex < volumePer100Index,
  'Per ounce information should precede the per 100g segment for volume defaults'
);
assert.ok(
  !volumeText.includes(' per g '),
  'Per unit segment should be omitted when gramsPerUnit is unavailable'
);
assert.ok(
  volumeText.includes(expectedPerOz),
  'Fallback ounce value should match the per-gram derived calculation'
);

console.log('nutritionInfoPerOunceTest passed');

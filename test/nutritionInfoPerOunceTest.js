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
  if (decodedHref.endsWith('Required for grocery app/uom_conversion_table.json')) {
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
assert.ok(perUnitIndex !== -1, 'Per unit segment should be present');
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

console.log('nutritionInfoPerOunceTest passed');

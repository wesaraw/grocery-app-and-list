import assert from 'assert';

const storageData = {
  breakfastMeals: [
    { id: 'b1', name: 'Pancakes', prepared: false, prepAhead: false, leftoverOk: false }
  ],
  snackMeals: [
    { id: 's1', name: 'Chips', prepared: false, prepAhead: false, leftoverOk: false }
  ],
  whatToCookVisibility: { snack: false },
  itemNameMap: {}
};

global.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        if (typeof keys === 'string') {
          cb({ [keys]: storageData[keys] });
          return;
        }
        if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(key => {
            result[key] = storageData[key];
          });
          cb(result);
          return;
        }
        if (keys && typeof keys === 'object') {
          const result = {};
          Object.keys(keys).forEach(key => {
            result[key] = storageData[key] !== undefined ? storageData[key] : keys[key];
          });
          cb(result);
          return;
        }
        cb({});
      },
      set(obj, cb) {
        Object.entries(obj || {}).forEach(([key, value]) => {
          storageData[key] = value;
        });
        if (typeof cb === 'function') cb();
      }
    }
  },
  runtime: {
    getURL: path => path
  }
};

global.fetch = async () => ({ json: async () => [] });

const dummyElement = () => ({
  addEventListener: () => {},
  appendChild: () => {},
  remove: () => {},
  removeChild: () => {},
  setAttribute: () => {},
  querySelectorAll: () => [],
  classList: { add: () => {}, remove: () => {} },
  style: {}
});

global.document = {
  addEventListener: () => {},
  getElementById: () => dummyElement(),
  createElement: () => dummyElement()
};

global.window = {};

global.location = { search: '' };

const mealData = await import('../utils/mealData.js');
const visibilityMap = await mealData.loadWhatToCookVisibility();
assert.strictEqual(
  visibilityMap.breakfast,
  true,
  'Breakfast should default to visible when not specified'
);
assert.strictEqual(
  visibilityMap.snack,
  false,
  'Stored visibility should mark snack meals as hidden'
);

const { loadAllMeals } = await import('../whatToCookWhen.js');
const mealMap = await loadAllMeals();
assert.ok(mealMap.b1, 'Visible meal category should be included');
assert.ok(!mealMap.s1, 'Hidden meal category should be excluded');
assert.strictEqual(mealMap.b1.categoryId, 'breakfast', 'Category metadata should be preserved');

console.log('whatToCookVisibilityTest passed');


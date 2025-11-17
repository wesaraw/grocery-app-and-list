import assert from 'assert';
import { parseQuantity } from '../utils/calendarUtils.js';
import { formatMealimeIngredientForStorage } from '../mealime/ingredientFormatter.js';
import { __mealImportInternals, __setMealImportTestHooks } from '../mealImport.js';

(function testFormatterUsesSizeMeasurementForBlocks() {
  const ingredient = {
    quantity: 8,
    unit: 'oz',
    sizeAmount: 8,
    sizeUnit: 'oz',
    sizeUsedAsMeasurement: true,
    containerQuantity: 0.5,
    containerUnit: 'block',
    originalText: '1/2 (8 oz) block cheddar cheese',
  };
  formatMealimeIngredientForStorage(ingredient);
  assert.strictEqual(ingredient.amount, '8 oz');
})();

(function testFormatterUsesSizeMeasurementForCans() {
  const ingredient = {
    quantity: 14.5,
    unit: 'oz',
    sizeAmount: 14.5,
    sizeUnit: 'oz',
    sizeUsedAsMeasurement: true,
    containerQuantity: 1,
    containerUnit: 'can',
    originalText: '1 (14.5 oz) can fire-roasted tomatoes',
  };
  formatMealimeIngredientForStorage(ingredient);
  assert.strictEqual(ingredient.amount, '14.5 oz');
})();

(function testFormatterKeepsDescriptorAfterUnit() {
  const ingredient = {
    quantity: 1,
    unit: 'each',
    sizeDescriptor: 'medium',
    originalText: '1 medium clove garlic',
  };
  formatMealimeIngredientForStorage(ingredient);
  assert.strictEqual(ingredient.amount, '1 each medium');
})();

(function testFormatterHandlesEachContainers() {
  const ingredient = {
    quantity: 2,
    unit: 'each',
    containerUnit: 'clove',
    originalText: '2 cloves garlic',
  };
  formatMealimeIngredientForStorage(ingredient);
  assert.strictEqual(ingredient.amount, '2 each');
})();

(function testFormatterProducesParserFriendlyAmounts() {
  const cases = [
    {
      ingredient: {
        quantity: 0.3,
        unit: 'cup',
        originalText: '0.3 cup packed brown sugar',
      },
      expectedUnit: 'cup',
      expectedValue: 0.3,
    },
    {
      ingredient: {
        quantity: 8,
        unit: 'oz',
        sizeAmount: 8,
        sizeUnit: 'oz',
        sizeUsedAsMeasurement: true,
        containerQuantity: 0.5,
        containerUnit: 'block',
        originalText: '1/2 (8 oz) block cheddar cheese',
      },
      expectedUnit: 'oz',
      expectedValue: 8,
    },
    {
      ingredient: {
        quantity: 14.5,
        unit: 'oz',
        sizeAmount: 14.5,
        sizeUnit: 'oz',
        sizeUsedAsMeasurement: true,
        containerQuantity: 1,
        containerUnit: 'can',
        originalText: '1 (14.5 oz) can fire-roasted tomatoes',
      },
      expectedUnit: 'oz',
      expectedValue: 14.5,
    },
  ];
  cases.forEach(({ ingredient, expectedUnit, expectedValue }) => {
    const formatted = formatMealimeIngredientForStorage({ ...ingredient });
    const parsed = parseQuantity(formatted.amount);
    assert.strictEqual(parsed.unit, expectedUnit);
    assert(Math.abs(parsed.value - expectedValue) < 1e-6, 'Parsed value mismatch');
  });
})();

(async function testNutritionSyncUsesContainerUnitsForServingText() {
  const capturedPayloads = [];
  __setMealImportTestHooks({
    ensureIngredientRecordForItem: async payload => {
      capturedPayloads.push(payload);
      return { status: 'ok' };
    },
    skipOriginalEnsureIngredientRecordForItem: true
  });
  try {
    await __mealImportInternals.syncNutritionForNewItem({
      name: 'Black Beans',
      unit: 'oz',
      sizeUnit: 'oz',
      sizeAmount: 15,
      sizeUsedAsMeasurement: true,
      containerQuantity: 1,
      containerUnit: 'can'
    });
  } finally {
    __setMealImportTestHooks({});
  }
  assert.strictEqual(capturedPayloads.length, 1, 'Expected nutrition sync payload to be captured once');
  const payload = capturedPayloads[0];
  assert.strictEqual(payload.home_unit, 'can');
  assert.strictEqual(payload.unit_default, 'can');
  assert.strictEqual(payload.unit, 'can');
  assert.strictEqual(payload.serving_size, '1 can');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

console.log('mealimeIngredientFormatterTest passed');

import assert from 'assert';
import { formatMealimeIngredientForStorage } from '../mealime/ingredientFormatter.js';

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

console.log('mealimeIngredientFormatterTest passed');

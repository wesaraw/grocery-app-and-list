import { __mealImportInternals } from '../mealImport.js';

const { deriveAverageEachWeight } = __mealImportInternals;

function expectEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but received ${actual}`);
  }
}

const stubResolver = (ingredient, record, density, options = {}) => {
  if (options.persistResolvedMeasure) {
    options.persistResolvedMeasure({
      measure: { grams: 660, qty: 6, source: 'fdc:portion', confidence: 'medium', sizeTag: 'chop' }
    });
  }
  return { grams: 110, source: 'fdc:portion', confidence: 'medium', sizeTag: 'chop' };
};

const baseContext = {
  ingredientMap: { 'pork chops': {} },
  densityMap: {},
  globalProduceMeasures: {}
};

const eachWeight = deriveAverageEachWeight(
  { name: 'Pork Chops', amount: '4 each' },
  baseContext,
  { resolveIngredientAmount: stubResolver }
);

if (!eachWeight) {
  throw new Error('Expected an average each weight to be derived');
}

expectEqual(eachWeight.gramsPerEach, 110, 'gramsPerEach should use captured measure weight');
expectEqual(eachWeight.source, 'fdc:portion', 'source should reflect the persisted measure');
expectEqual(eachWeight.confidence, 'medium', 'confidence should bubble from resolved measure');
expectEqual(eachWeight.sizeTag, 'chop', 'sizeTag should bubble from resolved measure');

const skipped = deriveAverageEachWeight(
  { name: 'Pork Chops', amount: '2 each', sizeUnit: 'oz' },
  baseContext,
  { resolveIngredientAmount: stubResolver }
);

if (skipped !== null) {
  throw new Error('Expected ingredients with explicit size to skip average each weight derivation');
}

console.log('mealImportEachWeight tests passed');

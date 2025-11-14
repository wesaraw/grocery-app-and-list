import { mergeStepQuantities } from '../mealime/stepQuantityAugmenter.js';

const ingredients = [
  {
    originalText: 'Garlic',
    name: 'garlic',
    quantity: null,
    normalizedQuantity: null,
    unit: null,
    normalizedUnit: null,
  },
  {
    originalText: 'Chili flakes',
    name: 'chili flakes',
    quantity: null,
    normalizedQuantity: null,
    unit: null,
    normalizedUnit: null,
  },
];

const steps = [
  'Mince 3 cloves garlic before adding to the pan.',
  'Sprinkle 1 tsp chili flakes over the dish.',
  'Finish with 2 tsp chili flakes to taste.',
];

const { ingredients: augmented, warnings } = mergeStepQuantities(ingredients, steps);

const garlic = augmented[0];
if (garlic.quantity !== 3 || garlic.normalizedQuantity !== 3 || garlic.unit !== 'clove') {
  throw new Error('Garlic quantity/unit were not merged from steps');
}
if (garlic.stepQuantitySource !== 0) {
  throw new Error('Garlic step index should be recorded');
}

const chili = augmented[1];
if (chili.quantity !== 1 || chili.unit !== 'tsp') {
  throw new Error('First chili flakes quantity should be used');
}
if (!warnings.some((warning) => warning.includes('chili flakes'))) {
  throw new Error('Expected warning for conflicting chili flake quantities');
}

console.log('Mealime step quantity augmenter tests passed');

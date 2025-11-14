import { normalizeIngredients } from '../mealime/ingredientNormalizer.js';

const sampleIngredients = [
  '1 1/2 cups jasmine rice (rinsed)',
  '½ tsp smoked paprika',
  'Pinch kosher salt',
  'Garlic cloves'
];

const { ingredients, warnings } = normalizeIngredients(sampleIngredients);

if (ingredients.length !== sampleIngredients.length) {
  throw new Error('normalizeIngredients should return entry for each input');
}

const rice = ingredients.find((ing) => ing.name === 'jasmine rice');
if (!rice || Math.abs(rice.quantity - 1.5) > 0.001 || rice.unit !== 'cup') {
  throw new Error('Failed to parse stacked fraction or cup unit');
}
if (rice.notes !== 'rinsed') {
  throw new Error('Failed to preserve parenthetical notes');
}

const paprika = ingredients.find((ing) => ing.name === 'smoked paprika');
if (!paprika || Math.abs(paprika.quantity - 0.5) > 0.001 || paprika.unit !== 'tsp') {
  throw new Error('Failed to normalize unicode fraction or teaspoon unit');
}

const salt = ingredients.find((ing) => ing.name === 'kosher salt');
if (!salt || salt.unit !== 'pinch' || salt.quantity != null) {
  throw new Error('Failed to detect pinch unit or allow missing quantity');
}

const garlic = ingredients.find((ing) => (ing.name || '').toLowerCase() === 'garlic cloves');
if (!garlic || garlic.quantity != null || garlic.unit != null) {
  throw new Error('Garlic should remain without quantity/unit when not provided');
}

if (!warnings.some((warning) => warning.includes('Garlic cloves'))) {
  throw new Error('Expected warning for missing garlic quantity');
}

console.log('Mealime ingredient normalizer tests passed');

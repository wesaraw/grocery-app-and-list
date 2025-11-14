import fs from 'fs';
import { importMealimeRecipe } from '../mealime/importer.js';

const fixtureHtml = fs.readFileSync('test/fixtures/mealime/standard.html', 'utf8');

let fetchCallCount = 0;
global.fetch = async () => {
  fetchCallCount += 1;
  return {
    ok: true,
    status: 200,
    text: async () => fixtureHtml,
  };
};

const result = await importMealimeRecipe('27173');

if (fetchCallCount !== 1) {
  throw new Error(`Expected fetch to be called once but saw ${fetchCallCount}`);
}

if (result.title !== 'Herbed Chicken Thighs') {
  throw new Error(`Unexpected title: ${result.title}`);
}

if (result.timeMinutes !== 45) {
  throw new Error(`Expected timeMinutes to be 45 but received ${result.timeMinutes}`);
}

if (result.servings !== 4) {
  throw new Error(`Expected servings to be 4 but received ${result.servings}`);
}

const chicken = result.ingredients.find((ing) => (ing.name || '').toLowerCase() === 'bone-in chicken thighs');
if (!chicken) {
  throw new Error('Missing chicken ingredient');
}
if (Math.abs(chicken.quantity - 1.5) > 0.001 || chicken.unit !== 'lb') {
  throw new Error('Chicken ingredient did not parse quantity/unit correctly');
}

const paprika = result.ingredients.find((ing) => (ing.name || '').toLowerCase() === 'smoked paprika');
if (!paprika || Math.abs(paprika.quantity - 0.5) > 0.001 || paprika.unit !== 'tsp') {
  throw new Error('Paprika ingredient did not normalize unicode fraction');
}

const garlic = result.ingredients.find((ing) => (ing.name || '').toLowerCase() === 'garlic');
if (!garlic) {
  throw new Error('Missing garlic ingredient');
}
if (garlic.quantity !== 3 || garlic.unit !== 'clove' || garlic.stepQuantitySource == null) {
  throw new Error('Garlic ingredient did not pick up quantity from steps');
}

if (result.steps.length !== 2 || result.steps.some((step) => !step.includes('garlic') && !step.includes('Preheat'))) {
  throw new Error('Steps were not preserved correctly');
}

if (!result.warnings.some((warning) => warning.includes('Salt to taste'))) {
  throw new Error('Missing warning for salt ingredient without quantity');
}

console.log('Mealime importer test passed');

import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!DOCTYPE html>');
global.DOMParser = window.DOMParser;

import { parseMealsFromXml } from '../mealImport.js';

const sampleXml = `<?xml version="1.0"?>
<meals>
  <meal>
    <category>lunchDinner</category>
    <name>Test Meal</name>
    <recipeBook>Sample Book</recipeBook>
    <weight>1</weight>
    <ingredients>
      <item>
        <name>Flour</name>
        <amount>2</amount>
        <unit>cup</unit>
      </item>
      <item>
        <name>Sugar</name>
        <amount>100</amount>
        <unit>g</unit>
      </item>
    </ingredients>
  </meal>
</meals>`;

const meals = parseMealsFromXml(sampleXml);

if (meals.length !== 1) {
  throw new Error('Expected one meal to be parsed');
}

const ingredients = meals[0].ingredients;
if (ingredients.length !== 2) {
  throw new Error('Expected two ingredients to be parsed');
}

if (ingredients[0].unit !== 'cup' || ingredients[0].amount !== '2 cup' || ingredients[0].serving_size !== '2 cup') {
  throw new Error('First ingredient unit data was not preserved correctly');
}

if (ingredients[1].unit !== 'g' || ingredients[1].amount !== '100 g' || ingredients[1].serving_size !== '100 g') {
  throw new Error('Second ingredient unit data was not preserved correctly');
}

console.log('mealImport tests passed');

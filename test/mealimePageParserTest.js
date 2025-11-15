import assert from 'assert';
import { readFileSync } from 'fs';
import { JSDOM } from 'jsdom';
import { parseMealimeDocument } from '../mealime/pageParser.js';

const fixturePath = 'Balsamic Chicken Wrap with Goat Cheese, Cranberries & Lemony Arugula.html';
const html = readFileSync(fixturePath, 'utf8');
const dom = new JSDOM(html);

const result = parseMealimeDocument(dom.window.document, {
  sourceUrl: 'https://app.mealime.com/recipe_variants/15085/print',
});

assert.strictEqual(result.title, 'Balsamic Chicken Wrap with Goat Cheese, Cranberries & Lemony Arugula');
assert.strictEqual(result.time, '30 minutes');
assert.strictEqual(result.servings, 4);
assert.strictEqual(result.sourceUrl, 'https://app.mealime.com/recipe_variants/15085/print');
assert.ok(Array.isArray(result.rawIngredients), 'ingredients should be an array');
assert.ok(Array.isArray(result.rawSteps), 'steps should be an array');
assert.strictEqual(result.rawIngredients.length, 15);
assert.strictEqual(result.rawSteps.length, 14);
assert.ok(result.rawIngredients[0].toLowerCase().includes('baby arugula'));
assert.ok(result.rawSteps[0].toLowerCase().includes('wash and dry the fresh produce'));
assert.strictEqual(result.warnings.length, 0);

console.log('✅ mealimePageParserTest passed');

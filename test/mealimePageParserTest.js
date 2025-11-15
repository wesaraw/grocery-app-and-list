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

(function testLineItemExtraction() {
  const snippet = `
    <html>
      <body>
        <h1>Sample Recipe</h1>
        <div class="description">30 minutes | serves 2</div>
        <h2>Grab ingredients</h2>
        <ul>
          <li>
            <div class="line-item">
              <div class="quantity">2 (5 oz) pkgs</div>
              <div class="ingredient">baby arugula</div>
              <div class="notes">divided</div>
            </div>
          </li>
          <li>
            <div class="line-item">
              <div class="quantity">1 cup</div>
              <div class="ingredient">cherry tomatoes</div>
            </div>
          </li>
        </ul>
        <h2>Cook & enjoy</h2>
        <ul>
          <li>Do a thing</li>
        </ul>
      </body>
    </html>
  `;
  const { window } = new JSDOM(snippet);
  const parsed = parseMealimeDocument(window.document);
  assert.strictEqual(parsed.rawIngredients.length, 2);
  assert.strictEqual(parsed.rawIngredients[0], '2 (5 oz) pkgs baby arugula divided');
  assert.strictEqual(parsed.rawIngredients[1], '1 cup cherry tomatoes');
})();

console.log('✅ mealimePageParserTest passed');

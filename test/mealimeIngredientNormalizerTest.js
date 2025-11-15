import assert from "assert";
import { normalizeIngredient, normalizeIngredientList } from "../mealime/ingredientNormalizer.js";

function findWarning(warnings, reason) {
  return warnings.find(warning => warning.reason === reason);
}

(function testMixedNumberParsing() {
  const warnings = [];
  const ingredient = normalizeIngredient("1 1/2 cups baby spinach", warnings);
  assert.strictEqual(ingredient.quantity, 1.5);
  assert.strictEqual(ingredient.unit, "cup");
  assert.strictEqual(ingredient.name, "baby spinach");
  assert.strictEqual(warnings.length, 0);
})();

(function testUnicodeFractions() {
  const warnings = [];
  const ingredient = normalizeIngredient("½ tsp kosher salt", warnings);
  assert.strictEqual(ingredient.quantity, 0.5);
  assert.strictEqual(ingredient.unit, "tsp");
  assert.strictEqual(ingredient.name, "kosher salt");
  assert.strictEqual(warnings.length, 0);
})();

(function testUnitNormalization() {
  const warnings = [];
  const ingredient = normalizeIngredient("2 tablespoons olive oil", warnings);
  assert.strictEqual(ingredient.unit, "tbsp");
})();

(function testHyphenatedFractions() {
  const warnings = [];
  const ingredient = normalizeIngredient("1-1/2 lb chicken breast", warnings);
  assert.strictEqual(ingredient.quantity, 1.5);
  assert.strictEqual(ingredient.unit, "lb");
})();

(function testWarningsWhenMissing() {
  const warnings = [];
  const ingredient = normalizeIngredient("Salt to taste", warnings);
  assert.strictEqual(ingredient.quantity, null);
  assert.strictEqual(ingredient.unit, null);
  assert.strictEqual(ingredient.name, "Salt to taste");
  assert.ok(findWarning(warnings, "quantity"));
  assert.ok(findWarning(warnings, "unit"));
})();

(function testNormalizeIngredientList() {
  const { ingredients, warnings } = normalizeIngredientList([
    "1 cup rice",
    "Pepper",
  ]);
  assert.strictEqual(ingredients.length, 2);
  assert.strictEqual(ingredients[0].unit, "cup");
  assert.strictEqual(warnings.length, 2);
})();

(function testPackageQuantityWithParenthetical() {
  const warnings = [];
  const ingredient = normalizeIngredient("2 (5 oz) pkgs baby arugula", warnings);
  assert.strictEqual(ingredient.quantity, 2);
  assert.strictEqual(ingredient.unit, "package");
  assert.strictEqual(ingredient.name, "baby arugula");
  assert.strictEqual(ingredient.sizeAmount, 5);
  assert.strictEqual(ingredient.sizeUnit, "oz");
  assert.strictEqual(warnings.length, 0);
})();

(function testPackageWithNotesFromParser() {
  const warnings = [];
  const ingredient = normalizeIngredient("2 (5 oz) pkgs baby arugula divided", warnings);
  assert.strictEqual(ingredient.quantity, 2);
  assert.strictEqual(ingredient.unit, "package");
  assert.strictEqual(ingredient.name, "baby arugula divided");
  assert.strictEqual(ingredient.sizeAmount, 5);
  assert.strictEqual(ingredient.sizeUnit, "oz");
  assert.strictEqual(warnings.length, 0);
})();

(function testPackageSizeUsedWhenQuantityMissing() {
  const warnings = [];
  const ingredient = normalizeIngredient("(5 oz) baby arugula", warnings);
  assert.strictEqual(ingredient.quantity, 5);
  assert.strictEqual(ingredient.unit, "oz");
  assert.strictEqual(ingredient.sizeAmount, 5);
  assert.strictEqual(ingredient.sizeUnit, "oz");
  assert.strictEqual(warnings.length, 0);
})();

(function testGoatCheeseLogCapturesSize() {
  const warnings = [];
  const ingredient = normalizeIngredient("1 (4 oz) log goat cheese", warnings);
  assert.strictEqual(ingredient.quantity, 1);
  assert.strictEqual(ingredient.unit, "log");
  assert.strictEqual(ingredient.name, "goat cheese");
  assert.strictEqual(ingredient.sizeAmount, 4);
  assert.strictEqual(ingredient.sizeUnit, "oz");
  assert.strictEqual(warnings.length, 0);
})();

console.log("mealimeIngredientNormalizerTest passed");

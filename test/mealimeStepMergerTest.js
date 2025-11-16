import assert from "assert";
import { mergeStepQuantities } from "../mealime/stepQuantityMerger.js";

(function testAggregatesAndMatchesIngredients() {
  const steps = [
    "Heat 1 tbsp olive oil in a skillet.",
    "Add 2 cups baby spinach and cook until wilted.",
    "Stir in 1/2 cup feta cheese before serving.",
  ];
  const ingredients = [
    { name: "Olive Oil", quantity: 1, unit: "tbsp" },
    { name: "Baby Spinach", quantity: 2, unit: "cup" },
    { name: "Feta Cheese", quantity: null, unit: null },
  ];
  const summary = mergeStepQuantities(steps, ingredients);
  assert.strictEqual(summary.stepQuantities.length, 3);
  const oil = summary.stepQuantities.find(entry => entry.ingredientName === "Olive Oil");
  assert.strictEqual(oil.quantity, 1);
  assert.strictEqual(oil.unit, "tbsp");
  const spinach = summary.stepQuantities.find(entry => entry.ingredientName === "Baby Spinach");
  assert.strictEqual(spinach.quantity, 2);
  assert.strictEqual(spinach.unit, "cup");
  assert.strictEqual(summary.instructions.includes("Heat 1 tbsp"), true);
})();

(function testWarnsWhenIngredientMissing() {
  const steps = ["Finish with 1 tsp flaky salt on top."];
  const summary = mergeStepQuantities(steps, []);
  assert.strictEqual(summary.stepQuantities.length, 0);
  assert.strictEqual(summary.discrepancies.length, 1);
  assert.ok(summary.warnings[0].includes("flaky salt"));
})();

(function testDetectsDiscrepancies() {
  const steps = ["Drizzle 2 tbsp olive oil over the salad."];
  const ingredients = [{ name: "olive oil", quantity: 1, unit: "tbsp" }];
  const summary = mergeStepQuantities(steps, ingredients);
  assert.strictEqual(summary.stepQuantities.length, 1);
  assert.strictEqual(summary.discrepancies.length, 1);
  assert.ok(summary.warnings[0].includes("Instructions call"));
})();

(function testMatchesPackageAbbreviationsAndDescriptors() {
  const steps = [
    "Divide 2 pkgs baby arugula (5 oz) between plates.",
    "Stir in 1 pkg baby spinach (4 oz) and serve.",
  ];
  const ingredients = [
    { name: "baby arugula", quantity: 2, unit: "package" },
    { name: "spinach", quantity: 1, unit: "package" },
  ];
  const summary = mergeStepQuantities(steps, ingredients);
  assert.strictEqual(summary.stepQuantities.length, 2);
  const arugula = summary.stepQuantities.find(entry => entry.ingredientName === "baby arugula");
  assert.strictEqual(arugula.quantity, 2);
  assert.strictEqual(arugula.unit, "package");
  const spinach = summary.stepQuantities.find(entry => entry.ingredientName === "spinach");
  assert.strictEqual(spinach.quantity, 1);
  assert.strictEqual(spinach.unit, "package");
  assert.strictEqual(summary.warnings.length, 0);
})();

console.log("mealimeStepMergerTest passed");

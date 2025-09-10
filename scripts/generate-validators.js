import { writeFileSync } from 'fs';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { schemas } from '../src/services/storageSchemas.js';

const ajv = new Ajv({ allErrors: true, code: { source: true, esm: true } });

for (const [key, schema] of Object.entries(schemas)) {
  ajv.addSchema(schema, key);
}

const nameMap = {
  items: 'items',
  coupons: 'coupons',
  stores: 'stores',
  meals: 'meals',
  users: 'users',
  userCategoryDays: 'user-category-days',
  cookingDays: 'cooking-days',
  mealPerDay: 'meal-per-day',
  mealPlan: 'meal-plan',
  preparedMealsCalendar: 'prepared-meals-calendar',
  whatToEatCalendar: 'what-to-eat-calendar',
  manualMealOverrides: 'manual-meal-overrides',
  metadata: 'metadata'
};

const code = standaloneCode(ajv, nameMap);

writeFileSync('src/services/validators.js', code);


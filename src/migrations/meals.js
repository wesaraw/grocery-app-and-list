/**
 * Migration from meal schema v1 (flags as top-level booleans) to v2 (flags object).
 */
export function mealV1ToV2(meal) {
  const { prepared, prepAhead, group, ...rest } = meal;
  return {
    ...rest,
    flags: {
      prepared: prepared ?? false,
      prepAhead: prepAhead ?? false,
      group: group ?? false,
    },
    ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
    weight: meal.weight ?? null,
    recipeBook: meal.recipeBook ?? null,
    version: 2,
  };
}

export const mealMigrations = {
  1: mealV1ToV2,
};

export function runMealMigrations(meal) {
  let current = { ...meal };
  while (mealMigrations[current.version]) {
    current = mealMigrations[current.version](current);
  }
  return current;
}

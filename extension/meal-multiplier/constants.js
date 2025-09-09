// Default meal categories and per-day multipliers.
// Mirrors legacy values from Version Old/mealMultiplier.js and
// the "Meal Multiplier" notes in Version 2.0 Upgrade Notes/Grocery App Feature List V1.0.txt.

const MEAL_CATEGORIES = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunchDinner', label: 'Lunch/Dinner' },
  { id: 'snack', label: 'Snack' },
  { id: 'dessert', label: 'Dessert' }
];

const DEFAULT_MEALS_PER_DAY = {
  breakfast: 1,
  // Lunch and dinner share the same category in the legacy app
  lunchDinner: 2,
  snack: 1,
  dessert: 1
};

const DEFAULT_MULTIPLIERS = Object.entries(DEFAULT_MEALS_PER_DAY).map(
  ([id, mealsPerDay]) => ({ id, mealsPerDay, version: 1 })
);

export { DEFAULT_MEALS_PER_DAY, DEFAULT_MULTIPLIERS, MEAL_CATEGORIES };
//# sourceMappingURL=constants.js.map

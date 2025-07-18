export const DEFAULT_MEALS_PER_DAY = {
  breakfast: 1,
  lunchDinner: 2, // lunch and dinner combined
  snack: 1,
  dessert: 1
};

/**
 * Calculate the monthly number of meal spots for a given category.
 *
 * @param {number} mealsPerDay - Total meals of this category served each day.
 * @param {number} peopleCount - Number of people eating this category.
 * @param {number} daysPerWeek - How many days each week they eat this category.
 * @param {number} mealVarietyCount - Number of different meals planned for this category.
 * @returns {number} Monthly spots for a single meal within the category.
 */
export function calculateMonthlyMealSpots(
  mealsPerDay,
  peopleCount,
  daysPerWeek,
  mealVarietyCount
) {
  const yearlySpots = mealsPerDay * (peopleCount * daysPerWeek) * 52;
  const spotsPerMealPerYear = yearlySpots / mealVarietyCount;
  return spotsPerMealPerYear / 12;
}

/**
 * Convert monthly spots to a monthly ingredient amount using a serving size.
 *
 * @param {number} monthlySpots - Output from calculateMonthlyMealSpots.
 * @param {number} servingSize - Amount consumed for one meal.
 * @returns {number} Monthly need in serving units.
 */
export function convertSpotsToMonthlyNeed(monthlySpots, servingSize) {
  return monthlySpots * servingSize;
}

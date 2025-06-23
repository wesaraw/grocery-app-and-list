export const MEAL_TYPES = {
  breakfast: {
    key: 'breakfastMeals',
    path: 'Required for grocery app/breakfast_meals.json',
    label: 'Breakfast'
  },
  lunchDinner: {
    key: 'lunchDinnerMeals',
    path: 'Required for grocery app/lunch_dinner_meals.json',
    label: 'Lunch/Dinner'
  },
  snack: {
    key: 'snackMeals',
    path: 'Required for grocery app/snack_meals.json',
    label: 'Snack'
  },
  dessert: {
    key: 'dessertMeals',
    path: 'Required for grocery app/dessert_meals.json',
    label: 'Dessert'
  }
};

// Default daily meal counts used by mealMath.js
export const DEFAULT_MEALS_PER_DAY = {
  breakfast: 1,
  lunchDinner: 2, // lunch and dinner combined
  snack: 1,
  dessert: 1
};

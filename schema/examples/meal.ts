import { Meal } from '../../src/models/index';

const meal: Meal = {
  id: 'meal-1',
  categoryId: 'cat-1',
  name: 'Spaghetti',
  prepared: false,
  prepAhead: false,
  groupMeal: false,
  weight: 1,
  ingredients: [
    { itemId: 'item-1', amount: 8, unit: 'Oz', version: 1 },
  ],
  version: 1,
};

export default meal;

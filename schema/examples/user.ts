import { User } from '../../src/models/index';

const user: User = {
  id: 'user-1',
  name: 'Alice',
  mealCategoryDays: { 'cat-1': ['Mon', 'Wed'] },
  subscriptions: { 'cat-1': ['meal-1'] },
  version: 1,
};

export default user;

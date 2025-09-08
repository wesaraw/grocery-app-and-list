export const SCHEMA_VERSION = 1;

export interface Item {
  id: string;
  name: string;
  unit: string;
  brand: string;
  density: number;
  storeId?: string;
  version: number;
}

export interface Store {
  id: string;
  name: string;
  logoUrl: string;
  defaultScraper: string;
  version: number;
}

export interface Purchase {
  itemId: string;
  date: string;
  quantity: number;
  price: number;
  version: number;
}

export interface MealPlan {
  date: string;
  mealType: string;
  items: string[];
  version: number;
}

export interface MealIngredient {
  name: string;
  amount: number;
  unit: string;
  cost?: number;
}

export interface MealFlags {
  prepared?: boolean;
  prepAhead?: boolean;
  group?: boolean;
}

export interface Meal {
  id: string;
  name: string;
  type: string;
  ingredients: MealIngredient[];
  flags: MealFlags;
  weight: number | null;
  recipeBook: string | null;
  version: number;
}

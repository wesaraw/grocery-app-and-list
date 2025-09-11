export const SCHEMA_VERSION = 1;

export interface CalendarEntry {
  id: string;
  date: string; // ISO date
  mealId: string;
  version: number;
}

export interface ConsumptionAdjustment {
  id: string;
  itemId: string;
  weekNumber: number;
  quantity: number;
  version: number;
}

export interface CookingDaySetting {
  id: string;
  categoryId: string;
  days: string[];
  prepAhead: boolean;
  version: number;
}

export type CouponType = 'percentOff' | 'amountOff' | 'costOverride';

export interface Coupon {
  id: string;
  itemId: string;
  storeId?: string;
  type: CouponType;
  value: number;
  startWeek: number;
  endWeek: number;
  version: number;
}

export interface SeasonRange {
  start: number;
  end: number;
}

export interface ConsumptionPlan {
  monthly: number;
  yearly: number;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  image?: string;
  unit: string;
  volumeWeightRatio: number;
  treatAsWholeUnit: boolean;
  shelfLifeWeeks: number;
  seasonRanges: SeasonRange[];
  currentStockByWeek: Record<number, number>;
  consumptionPlan: ConsumptionPlan;
  version: number;
}

export interface MealIngredient {
  itemId: string;
  amount: number;
  unit: string;
  version: number;
}

export interface Meal {
  id: string;
  categoryId: string;
  name: string;
  image?: string;
  recipeBook?: string;
  prepared: boolean;
  prepAhead: boolean;
  groupMeal: boolean;
  weight: number;
  ingredients: MealIngredient[];
  version: number;
}

export interface MealCategory {
  id: string;
  name: string;
  version: number;
}

export interface MealMultiplier {
  categoryId: string;
  occurrencesPerDay: number;
  version: number;
}

export interface MealOverride {
  id: string;
  userId: string;
  categoryId: string;
  weekNumber: number;
  mealIds: string[];
  version: number;
}

export interface PriceThreshold {
  id: string;
  userId: string;
  categoryId: string;
  maxCost: number;
  version: number;
}

export interface Purchase {
  id: string;
  itemId: string;
  quantity: number;
  weekNumber: number;
  date: string;
  version: number;
}

export interface Store {
  id: string;
  name: string;
  searchUrl: string;
  version: number;
}

export interface StoreProduct {
  id: string;
  itemId: string;
  storeId: string;
  name: string;
  url: string;
  scrapedAt: string;
  cost: number;
  costPerUnit: number;
  unit: string;
  quantity: number;
  image?: string;
  version: number;
}

export interface User {
  id: string;
  name: string;
  mealCategoryDays?: Record<string, string[]>;
  subscriptions?: Record<string, string[]>;
  version: number;
}

export interface AppSchema {
  calendarEntries: CalendarEntry[];
  consumptionAdjustments: ConsumptionAdjustment[];
  cookingDaySettings: CookingDaySetting[];
  coupons: Coupon[];
  items: Item[];
  meals: Meal[];
  mealCategories: MealCategory[];
  mealMultipliers: MealMultiplier[];
  mealOverrides: MealOverride[];
  priceThresholds: PriceThreshold[];
  purchases: Purchase[];
  stores: Store[];
  storeProducts: StoreProduct[];
  users: User[];
}

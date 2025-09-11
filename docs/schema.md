# Schema Baseline

Canonical data shapes inferred from Version 2.0 Upgrade Notes/Grocery App Feature List V1.0.

## CalendarEntry
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique entry id | required |
| date | string | ISO date for the meal | required |
| mealId | string | scheduled meal | required |
| version | number | schema version | required |

## ConsumptionAdjustment
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique adjustment id | required |
| itemId | string | item being adjusted | required |
| weekNumber | number | week the consumption occurred | required |
| quantity | number | negative quantity to subtract from stock | required |
| version | number | schema version | required |

## CookingDaySetting
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique setting id | required |
| categoryId | string | meal category | required |
| days | string[] | days of week cooking is allowed | empty array means none |
| prepAhead | boolean | true if this setting represents prep-ahead days | default false |
| version | number | schema version | required |

## Coupon
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique coupon id | required |
| itemId | string | item the coupon applies to | required |
| storeId | string | specific store or blank for all | optional |
| type | "percentOff" \| "amountOff" \| "costOverride" | coupon calculation method | required |
| value | number | discount or override amount | required |
| startWeek | number | week the coupon begins | required |
| endWeek | number | week the coupon ends | required |
| version | number | schema version | required |

## Item
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique item id | required |
| name | string | item name | required |
| category | string | item category | required |
| image | string | picture for the item | optional |
| unit | string | home unit of measure | default "Oz" |
| volumeWeightRatio | number | volume to weight conversion ratio | default 1 |
| treatAsWholeUnit | boolean | deduct whole containers when true | default false |
| shelfLifeWeeks | number | expiration period in weeks | default 2 |
| seasonRanges | {start:number,end:number}[] | weeks when item is in season | optional |
| currentStockByWeek | Record<number, number> | planned stock levels by week | defaults apply to current week |
| consumptionPlan | {monthly:number, yearly:number} | secondary plan | yearly defaults 0 |
| version | number | schema version | required |

## Meal
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique meal id | required |
| categoryId | string | meal category | required |
| name | string | meal name | required |
| image | string | meal image URL | optional |
| recipeBook | string | source recipe book | optional |
| prepared | boolean | true if meal is a prepared meal | default false |
| prepAhead | boolean | true if meal requires advance preparation | default false |
| groupMeal | boolean | true if meal is scheduled for all users together | default false |
| weight | number | scheduling weight relative to other meals | default 1 |
| ingredients | MealIngredient[] | list of ingredients and amounts | required |
| version | number | schema version | required |

## MealCategory
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique category id | required |
| name | string | category name | required |
| version | number | schema version | required |

## MealIngredient
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| itemId | string | referenced inventory item | required |
| amount | number | amount per user | required |
| unit | string | unit of measure for the amount | required |
| version | number | schema version | required |

## MealMultiplier
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| categoryId | string | meal category | required |
| occurrencesPerDay | number | number of meals of this type per day | required |
| version | number | schema version | required |

## MealOverride
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique override id | required |
| userId | string | user affected | required |
| categoryId | string | meal category being overridden | required |
| weekNumber | number | calendar week for the override | required |
| mealIds | string[] | ordered list of meals filling available slots | required |
| version | number | schema version | required |

## PriceThreshold
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique threshold id | required |
| userId | string | user to apply limit to | required |
| categoryId | string | meal category | required |
| maxCost | number | maximum cost per meal | required |
| version | number | schema version | required |

## Purchase
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique purchase id | required |
| itemId | string | purchased item | required |
| quantity | number | quantity added to stock | required |
| weekNumber | number | week the stock applies to | required |
| date | string | date of purchase | required |
| version | number | schema version | required |

## Store
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique store id | required |
| name | string | store name | required |
| searchUrl | string | template URL for item searches | required |
| version | number | schema version | required |

## StoreProduct
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique store product id | required |
| itemId | string | associated inventory item | required |
| storeId | string | store offering the product | required |
| name | string | store-provided product name | required |
| url | string | product page URL | required |
| scrapedAt | string | timestamp when data was scraped | required |
| cost | number | total cost of the package | required |
| costPerUnit | number | cost per unit | required |
| unit | string | unit of measure for the quantity | required |
| quantity | number | units contained in the package | required |
| image | string | product image URL | optional |
| version | number | schema version | required |

## User
| field | type | description | defaults/constraints |
| --- | --- | --- | --- |
| id | string | unique user id | required |
| name | string | user name | required |
| mealCategoryDays | Record<string, string[]> | days of week to schedule each category | optional |
| subscriptions | Record<string, string[]> | meal IDs the user is subscribed to per category | optional |
| version | number | schema version | required |

## Derived or Calculated Values

Values noted in the feature list that are computed from other fields rather than stored:

- **CalendarEntry.costPerPerson** – computed from ingredient costs and user counts; not persisted.
- **CalendarEntry.image** – resolved from the linked Meal; not persisted.
- **MealIngredient.cost** – calculated from `StoreProduct.costPerUnit` and `amount`; not persisted.
- **StoreProduct.costPerUnit** – scraped from the store and saved even though it can be derived from `cost` and `quantity`.
- **monthlyCost**, **weeklyNeed**, and **packsNeeded** – derived from consumption plans and package sizes when displaying totals; not persisted.


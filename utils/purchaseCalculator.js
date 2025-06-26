import { getStockBeforeWeek } from './timeline.js';
import { WEEKS_PER_MONTH } from './constants.js';
import { normalizeName } from './nameUtils.js';

export function calculatePurchaseNeeds(
  needs,
  consumption,
  stock,
  expiration,
  consumedYear = [],
  mealYear = [],
  purchases = {},
  week = 1
) {
  const consMap = new Map(consumption.map(i => [normalizeName(i.name), i]));
  const expMap = new Map(expiration.map(i => [normalizeName(i.name), i]));

  const mealMap = new Map(mealYear.map(m => [normalizeName(m.name), m.total_needed_year]));
  const mergedNeeds = needs.map(n => {
    const key = normalizeName(n.name);
    return {
      ...n,
      total_needed_year: (n.total_needed_year || 0) + (mealMap.get(key) || 0)
    };
  });

  const timelineItems = mergedNeeds.map(item => {
    const key = normalizeName(item.name);
    return {
      name: item.name,
      weekly_consumption:
        (consMap.get(key)?.monthly_consumption ?? 0) / WEEKS_PER_MONTH,
      expiration_weeks:
        (expMap.get(key)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH,
      starting_stock: stock.find(s => normalizeName(s.name) === key)?.amount ?? 0
    };
  });

  const stockBefore = getStockBeforeWeek(timelineItems, purchases, week);
  const stockMap = new Map(stockBefore.map(i => [normalizeName(i.name), i.amount]));

  const weeksRemaining = 52 - week + 1;

  const futurePurchasesMap = new Map();
  Object.keys(purchases).forEach(name => {
    const total = purchases[name]
      .filter(p => p.purchase_week >= week)
      .reduce((sum, p) => sum + (p.quantity_purchased || 0), 0);
    futurePurchasesMap.set(normalizeName(name), total);
  });

  const purchasesWithinMap = new Map();
  mergedNeeds.forEach(item => {
    const key = normalizeName(item.name);
    const expWeeks =
      (expMap.get(key)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH;
    const horizon = week + Math.ceil(expWeeks);
    const list = purchases[item.name] || [];
    const total = list
      .filter(p => p.purchase_week >= week && p.purchase_week < horizon)
      .reduce((sum, p) => sum + (p.quantity_purchased || 0), 0);
    purchasesWithinMap.set(key, total);
  });

  return mergedNeeds.map(item => {
    const key = normalizeName(item.name);
    const yearlyAmount =
      item.total_needed_year ??
      (consMap.get(key)?.monthly_consumption ?? 0) * 12;

    const required = (yearlyAmount / 52) * weeksRemaining;

    const onHand =
      (stockMap.get(key) || 0) + (futurePurchasesMap.get(key) || 0);

    // calculate gating amount based on expiration
    const weeklyCons =
      (consMap.get(key)?.monthly_consumption ?? 0) / WEEKS_PER_MONTH;
    const expWeeks =
      (expMap.get(key)?.shelf_life_months ?? 12) * WEEKS_PER_MONTH;
    const horizon = week + Math.ceil(expWeeks);

    const horizonStock = getStockBeforeWeek(
      [timelineItems.find(t => t.name === item.name)],
      { [item.name]: purchases[item.name] || [] },
      horizon
    )[0]?.amount ?? 0;

    const purchasesWithin = purchasesWithinMap.get(key) || 0;
    const currentQty = stockMap.get(key) || 0;
    const consumedExisting = currentQty + purchasesWithin - horizonStock;
    const capacity = weeklyCons * (horizon - week);
    let toBuyExpiration = capacity - consumedExisting;
    if (toBuyExpiration < 0) toBuyExpiration = 0;

    let toBuy = Math.min(required - onHand, toBuyExpiration);
    if (item.treat_as_whole_unit) {
      toBuy = Math.ceil(toBuy);
    }
    return {
      name: item.name,
      toBuy: toBuy > 0 ? toBuy : 0,
      home_unit: item.home_unit
    };
  });
}

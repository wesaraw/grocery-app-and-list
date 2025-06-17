import { getStockForWeek } from './timeline.js';

export function calculatePurchaseNeeds(
  needs,
  consumption,
  stock,
  expiration,
  consumedYear = [],
  purchases = {},
  week = 1
) {
  const consMap = new Map(consumption.map(i => [i.name, i]));
  const expMap = new Map(expiration.map(i => [i.name, i]));
  const consumedMap = new Map(consumedYear.map(i => [i.name, i]));

  const timelineItems = needs.map(item => ({
    name: item.name,
    weekly_consumption:
      (consMap.get(item.name)?.monthly_consumption ?? 0) / 4.33,
    expiration_weeks: (expMap.get(item.name)?.shelf_life_months ?? 12) * 4.33,
    starting_stock: stock.find(s => s.name === item.name)?.amount ?? 0
  }));

  const futureStock = getStockForWeek(timelineItems, purchases, week);
  const stockMap = new Map(futureStock.map(i => [i.name, i]));

  return needs.map(item => {
    const cons = consMap.get(item.name)?.monthly_consumption ?? 0;
    const shelfLife = expMap.get(item.name)?.shelf_life_months ?? 12;
    const current = stockMap.get(item.name)?.amount ?? 0;
    const consumed = consumedMap.get(item.name)?.amount ?? 0;

    const requiredForPeriod = cons * shelfLife;
    const yearlyRemaining = (item.total_needed_year ?? requiredForPeriod) - consumed;
    let toBuy = Math.min(requiredForPeriod, yearlyRemaining) - current;
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

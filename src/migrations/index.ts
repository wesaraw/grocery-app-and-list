import { Item } from '../models/index';

export type Migration<T> = (entity: T) => T;

export function v1ToV2(item: any): Item {
  return {
    id: item.id || item.name || '',
    name: item.name || '',
    category: item.category || '',
    uom: item.uom || item.unit || 'Oz',
    volumeWeightRatio: item.volumeWeightRatio ?? item.density ?? 1,
    treatAsWholeUnit: item.treatAsWholeUnit ?? item.treat_as_whole_unit ?? false,
    shelfLifeWeeks: item.shelfLifeWeeks ?? (item.shelf_life_months ? item.shelf_life_months * 4 : 0),
    seasonRanges: Array.isArray(item.seasonRanges) ? item.seasonRanges : [],
    currentStockByWeek: item.currentStockByWeek || {},
    consumptionPlan:
      item.consumptionPlan || {
        monthly: item.monthly_consumption ?? 0,
        yearly: item.total_needed_year ?? 0,
      },
    version: 2,
  };
}

export const migrations: Record<number, Migration<any>> = {
  1: v1ToV2,
};

export function runMigrations<T extends { version?: number }>(entity: T): T {
  let current: any = { ...entity };
  if (current.version === undefined) current.version = 1;
  while (migrations[current.version]) {
    current = migrations[current.version](current);
  }
  return current;
}

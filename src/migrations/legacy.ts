import { Item } from '../models/index';

interface LegacyData {
  yearlyNeeds?: any[];
  monthlyConsumption?: any[];
  currentStock?: any[];
  densityRatios?: Record<string, { ratio: number } | undefined>;
  expirationData?: any[];
  itemSeasons?: Record<string, { start: number; end: number }[]>;
}

// Convert scattered v1 structures into canonical Item objects.
export function migrateLegacyData(data: LegacyData): Item[] {
  const items = new Map<string, Item>();

  for (const n of data.yearlyNeeds || []) {
    const id = n.id || n.name;
    items.set(id, {
      id,
      name: n.name || '',
      category: n.category || '',
      uom: n.home_unit || 'Oz',
      volumeWeightRatio: 1,
      treatAsWholeUnit: Boolean(n.treat_as_whole_unit),
      shelfLifeWeeks: 0,
      seasonRanges: [],
      currentStockByWeek: {},
      consumptionPlan: { monthly: 0, yearly: n.total_needed_year || 0 },
      version: 1,
    });
  }

  for (const c of data.monthlyConsumption || []) {
    const item = items.get(c.id);
    if (item) item.consumptionPlan.monthly = c.monthly_consumption || 0;
  }

  for (const s of data.currentStock || []) {
    const item = items.get(s.id);
    if (item) item.currentStockByWeek[0] = s.amount || 0;
  }

  for (const [id, ratio] of Object.entries(data.densityRatios || {})) {
    const item = items.get(id);
    if (item && ratio) item.volumeWeightRatio = ratio.ratio ?? 1;
  }

  for (const e of data.expirationData || []) {
    const item = items.get(e.id);
    if (item) item.shelfLifeWeeks = (e.shelf_life_months ?? 0) * 4;
  }

  for (const [id, seasons] of Object.entries(data.itemSeasons || {})) {
    const item = items.get(id);
    if (item) item.seasonRanges = Array.isArray(seasons) ? seasons : [];
  }

  return Array.from(items.values()).map((i) => ({
    ...i,
    uom: i.uom || 'Oz',
    volumeWeightRatio: i.volumeWeightRatio || 1,
    version: 2,
  }));
}

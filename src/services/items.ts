import { Item } from '../models/index';
import * as storageService from './storageService.js';
import { runMigrations } from '../migrations/index';

const ITEM_KEY = 'item-data';

async function getAll(): Promise<Item[]> {
  const raw: any[] = await storageService.get(ITEM_KEY, []);
  return raw.map((r) => runMigrations<Item>(r));
}

async function saveAll(items: Item[]): Promise<void> {
  await storageService.set(ITEM_KEY, items);
}

function makeItem(data: Partial<Item> & { id: string; name: string }): Item {
  return {
    id: data.id,
    name: data.name,
    category: data.category || '',
    uom: data.uom || 'Oz',
    volumeWeightRatio: data.volumeWeightRatio ?? 1,
    treatAsWholeUnit: data.treatAsWholeUnit ?? false,
    shelfLifeWeeks: data.shelfLifeWeeks ?? 0,
    seasonRanges: data.seasonRanges || [],
    currentStockByWeek: data.currentStockByWeek || {},
    consumptionPlan: data.consumptionPlan || { monthly: 0, yearly: 0 },
    version: data.version ?? 2,
  };
}

async function update(id: string, patch: Partial<Item>): Promise<Item | undefined> {
  const items = await getAll();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return undefined;
  const current = items[index];
  const updated: Item = { ...current, ...patch, version: current.version + 1 };
  items[index] = updated;
  await saveAll(items);
  return updated;
}

export async function addItem(data: Partial<Item> & { name: string }): Promise<Item> {
  const items = await getAll();
  const id = data.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString());
  const item = makeItem({ ...data, id });
  items.push(item);
  await saveAll(items);
  return item;
}

export async function removeItem(id: string): Promise<boolean> {
  const items = await getAll();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return false;
  items.splice(index, 1);
  await saveAll(items);
  return true;
}

export const renameItem = (id: string, name: string) => update(id, { name });
export const updateItemCategory = (id: string, category: string) => update(id, { category });
export const updateItemUnit = (id: string, uom: string) => update(id, { uom });
export const updateDensityRatio = (id: string, ratio: number) => update(id, { volumeWeightRatio: ratio });
export const updateExpiration = (id: string, weeks: number) => update(id, { shelfLifeWeeks: weeks });
export const updateSeasons = (id: string, ranges: { start: number; end: number }[]) =>
  update(id, { seasonRanges: ranges });

import * as storageService from '../services/storageService.js';
import { runMigrations } from '../migrations/index';
import { Item, StoreProduct } from './types';

const ITEM_KEY = 'item-data';
const STORE_PRODUCT_KEY = 'store-products';

export async function getItems(): Promise<Item[]> {
  const items: any[] = await storageService.get(ITEM_KEY, []);
  return items.map((i) => runMigrations<Item>(i));
}

export async function updateItemById(id: string, patch: Partial<Item>): Promise<Item | undefined> {
  const items = await getItems();
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return undefined;
  const updated = { ...items[index], ...patch } as Item;
  items[index] = updated;
  await storageService.set(ITEM_KEY, items);
  return updated;
}

export async function getStoreProducts(): Promise<StoreProduct[]> {
  return storageService.get(STORE_PRODUCT_KEY, []);
}

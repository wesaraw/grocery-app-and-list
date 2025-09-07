import { Item, StoreProduct } from '../storage/types';
import * as storageService from './storageService.js';
import { runMigrations } from '../migrations/index';

const ITEM_KEY = 'item-data';
const PRODUCT_KEY = 'store-products';
const META_KEY = 'metadata';
const FORBIDDEN_PREFIXES = ['final_', 'scraped_', 'selected_'];

export interface BackupData {
  'item-data': Item[];
  'store-products': StoreProduct[];
  metadata: Record<string, any>;
}

export async function saveBackup(): Promise<Blob> {
  const data: BackupData = {
    'item-data': await storageService.get(ITEM_KEY, []),
    'store-products': await storageService.get(PRODUCT_KEY, []),
    metadata: await storageService.get(META_KEY, { storageVersion: 2 })
  };
  const json = JSON.stringify(data, null, 2);
  return new Blob([json], { type: 'application/json' });
}

function hasForbiddenKeys(obj: Record<string, any>): boolean {
  return Object.keys(obj).some(k =>
    FORBIDDEN_PREFIXES.some(prefix => k.startsWith(prefix))
  );
}

export async function loadBackup(file: { text(): Promise<string> }): Promise<void> {
  const text = await file.text();
  let data: BackupData;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('Invalid backup file');
  }

  if (hasForbiddenKeys(data as any)) {
    throw new Error('Deprecated key prefix found');
  }

  const items = Array.isArray(data['item-data']) ? data['item-data'] : [];
  const products = Array.isArray(data['store-products']) ? data['store-products'] : [];
  const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : { storageVersion: 2 };

  const migratedItems = items.map(i => runMigrations<Item>(i));

  await storageService.set(ITEM_KEY, migratedItems);
  await storageService.set(PRODUCT_KEY, products);
  await storageService.set(META_KEY, metadata);
}

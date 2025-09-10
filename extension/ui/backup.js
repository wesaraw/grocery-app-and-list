import { get as storageGet, set as storageSet } from '../storageService.js';

const KEYS = [
  'items',
  'stores',
  'coupons',
  'meals',
  'users',
  'user-category-days',
  'cooking-days',
  'meal-per-day',
  'meal-plan',
  'prepared-meals-calendar',
  'what-to-eat-calendar',
  'manual-meal-overrides',
  'store-products',
  'meal-categories',
  'metadata'
];

export async function exportAll() {
  const data = {};
  for (const key of KEYS) {
    data[key] = await storageGet(key);
  }
  return data;
}

export async function importAll(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('Invalid data');
  const currentMeta = await storageGet('metadata');
  if (obj.metadata?.storageVersion !== currentMeta.storageVersion) {
    throw new Error('Version mismatch');
  }
  for (const key of KEYS) {
    if (obj[key] !== undefined) {
      // eslint-disable-next-line no-await-in-loop
      await storageSet(key, obj[key]);
    }
  }
}

if (typeof document !== 'undefined') {
  document.getElementById('exportBtn').addEventListener('click', async () => {
    const json = JSON.stringify(await exportAll(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grocery_backup.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importAll(data);
      // eslint-disable-next-line no-alert
      alert('Import complete');
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert('Invalid file');
    }
  });
}

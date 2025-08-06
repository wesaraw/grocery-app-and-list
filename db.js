import Dexie from 'dexie';

export const schemaVersion = 1;

class GroceryDB extends Dexie {
  constructor() {
    super('groceryDB');
    this.version(schemaVersion)
      .stores({
        items: '&id,name,category',
        meals: '&id,name,category',
        history: '&id,itemId,timestamp,date'
      })
      .upgrade(() => {
        // Placeholder for future migrations when schema changes
      });
  }
}

export const db = new GroceryDB();

export async function exportAll() {
  const dump = { schemaVersion };
  for (const table of db.tables) {
    dump[table.name] = await table.toArray();
  }
  return JSON.stringify(dump);
}

export async function importAll(text) {
  const data = JSON.parse(text);
  if (data.schemaVersion !== schemaVersion) {
    throw new Error('Incompatible schema version');
  }
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      if (data[table.name]) {
        await table.clear();
        await table.bulkPut(data[table.name]);
      }
    }
  });
}

export async function migrateFromLocalStorage() {
  const keys = ['items', 'meals', 'history'];
  const legacy = await new Promise(res => chrome.storage.local.get(keys, res));
  let migrated = false;
  await db.transaction('rw', db.tables, async () => {
    if (Array.isArray(legacy.items) && legacy.items.length) {
      await db.items.bulkPut(legacy.items);
      migrated = true;
    }
    if (Array.isArray(legacy.meals) && legacy.meals.length) {
      await db.meals.bulkPut(legacy.meals);
      migrated = true;
    }
    if (Array.isArray(legacy.history) && legacy.history.length) {
      await db.history.bulkPut(legacy.history);
      migrated = true;
    }
  });
  if (migrated) {
    await new Promise(res => chrome.storage.local.remove(keys, res));
  }
}


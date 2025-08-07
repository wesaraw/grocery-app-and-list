import Dexie from '../node_modules/dexie/dist/dexie.mjs';

export const schemaVersion = 4;

class GroceryDB extends Dexie {
  constructor() {
    super('groceryDB');
    this.version(schemaVersion)
      .stores({
        items: '&id,name,category',
        meals: '&id,name,category',
        history: '&id,itemId,timestamp,date,type,[itemId+type]',
        lists: '&key'
      })
      .upgrade(tx => {
        // Ensure new compound index is created for existing data
        tx.table('history').toCollection().modify({});
      });
  }
}

export const db = new GroceryDB();

// Simple pub/sub so UI modules can react to IndexedDB updates
const changeSubscribers = new Set();
function emitChange(table) {
  changeSubscribers.forEach(cb => {
    try {
      cb(table);
    } catch (_) {}
  });
}

// hook into all tables and notify listeners on any write operation
db.tables.forEach(table => {
  table.hook('creating', () => emitChange(table.name));
  table.hook('updating', () => emitChange(table.name));
  table.hook('deleting', () => emitChange(table.name));
});

export function subscribeToChanges(cb) {
  changeSubscribers.add(cb);
  return () => changeSubscribers.delete(cb);
}

export async function exportAll() {
  const dump = { schemaVersion };
  for (const table of db.tables) {
    dump[table.name] = await table.toArray();
  }
  return JSON.stringify(dump);
}

export async function importAll(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Malformed JSON backup');
  }
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
  const arrayKeys = ['items', 'meals', 'history'];
  const listKeys = [
    'currentStock',
    'yearlyNeeds',
    'searchResults',
    'consumedThisYear',
    'consumptionOverrides',
    'expirationData',
    'lastCommitItems',
    'mealCategories',
    'mealPlanMonthly',
    'mealPlanYearly',
    'monthlyConsumption',
    'userCategoryDays',
    'users',
    'coupons',
    'itemSeasons',
    'mealPlanMonthlyBreakdown',
    'userPriceThresholds',
    'whatToEatCalendar',
    'calendarColumnOrder',
    'cookingDays',
    'mealSlots',
    'mealsPerDay',
    'pendingCommitWeek',
    'storeSelections'
  ];
  const allKeys = arrayKeys.concat(listKeys);
  const legacy = await new Promise(res => chrome.storage.local.get(allKeys, res));
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
    for (const key of listKeys) {
      if (legacy[key] !== undefined) {
        await db.lists.put({ key, value: legacy[key] });
        migrated = true;
      }
    }
  });
  if (migrated) {
    await new Promise(res => chrome.storage.local.remove(allKeys, res));
  }
}


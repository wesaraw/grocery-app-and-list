import { migrateSearchResults, setSearchResult, getSearchResult, loadSearchResults } from '../utils/searchResults.js';
import { getItemId } from '../utils/itemRegistry.js';

const storage = {};

global.chrome = {
  storage: {
    local: {
      get: (key, cb) => {
        if (key == null) return cb({ ...storage });
        if (Array.isArray(key)) {
          const res = {};
          for (const k of key) res[k] = storage[k];
          return cb(res);
        }
        if (typeof key === 'string') return cb({ [key]: storage[key] });
        cb({});
      },
      set: (obj, cb) => {
        Object.assign(storage, obj);
        cb && cb();
      },
      remove: (keys, cb) => {
        if (Array.isArray(keys)) {
          for (const k of keys) delete storage[k];
        } else {
          delete storage[keys];
        }
        cb && cb();
      }
    }
  }
};

async function run() {
  const appleId = await getItemId('Apple');
  const bananaId = await getItemId('Banana');
  storage.storeSelections = [
    { id: appleId, store: 'Walmart', price: 1, link: 'a' },
    { name: 'Apple', store: 'Walmart', price: 2, link: 'b' },
    { name: 'Apple', store: 'Amazon', price: 3, link: 'c' }
  ];
  await migrateSearchResults();
  const results = await loadSearchResults();
  if (!results[appleId] || !results[appleId].Walmart || results[appleId].Walmart.price !== 2)
    throw new Error('Migration failed for Apple');
  if (!results[appleId].Amazon || results[appleId].Amazon.link !== 'c')
    throw new Error('Amazon entry missing');
  if (storage.storeSelections !== undefined)
    throw new Error('Old storeSelections not removed');

  await setSearchResult(bananaId, 'Shaws', { link: 's', price: 4 });
  const shaws = await getSearchResult(bananaId, 'Shaws');
  if (!shaws || shaws.price !== 4 || shaws.link !== 's')
    throw new Error('set/get search result failed');

  console.log('searchResults tests passed');
}

await run();

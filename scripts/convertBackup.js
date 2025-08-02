import fs from 'fs';
import path from 'path';

function findLatestBackup(dir) {
  const files = fs.readdirSync(dir).filter(f => /^grocery_backup.*\.txt$/.test(f));
  if (files.length === 0) throw new Error('No backup files found');
  files.sort((a, b) => fs.statSync(path.join(dir, b)).mtime - fs.statSync(path.join(dir, a)).mtime);
  return path.join(dir, files[0]);
}

function collectNames(obj, sets) {
  const { items, stores, meals, books } = sets;
  if (Array.isArray(obj)) {
    obj.forEach(v => collectNames(v, sets));
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'item' && typeof v === 'string') items.add(v);
      if (k === 'store' && typeof v === 'string') stores.add(v);
      if (k === 'recipeBook' && typeof v === 'string') books.add(v);
      if (k === 'name' && typeof v === 'string') {
        if (obj.ingredients) meals.add(v);
        else items.add(v);
      }
      collectNames(v, sets);
    }
  }
}

function buildMap(set) {
  const arr = Array.from(set);
  const map = {};
  arr.forEach((name, i) => {
    map[name] = i + 1;
  });
  return { arr, map };
}

function replaceNames(obj, maps) {
  if (Array.isArray(obj)) return obj.map(v => replaceNames(v, maps));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = replaceNames(v, maps);
    }
    return out;
  }
  if (typeof obj === 'string') {
    if (maps.items[obj]) return maps.items[obj];
    if (maps.stores[obj]) return maps.stores[obj];
    if (maps.meals[obj]) return maps.meals[obj];
    if (maps.books[obj]) return maps.books[obj];
  }
  return obj;
}

function main() {
  const latest = findLatestBackup('.');
  const raw = fs.readFileSync(latest, 'utf8');
  const data = JSON.parse(raw);

  const items = new Set();
  const stores = new Set();
  const meals = new Set();
  const books = new Set();

  const finalEntries = [];
  const selectedEntries = [];

  for (const key of Object.keys(data)) {
    if (key.startsWith('final_')) {
      const itemName = decodeURIComponent(key.slice(6));
      const storeName = data[key];
      items.add(itemName);
      stores.add(storeName);
      finalEntries.push({ itemName, storeName });
      delete data[key];
    } else if (key.startsWith('selected_')) {
      const m = key.match(/^selected_(.+)_(.+)$/);
      if (m) {
        const itemName = decodeURIComponent(m[1]);
        const storeName = decodeURIComponent(m[2]);
        items.add(itemName);
        stores.add(storeName);
        selectedEntries.push({ itemName, storeName, data: data[key] });
      }
      delete data[key];
    }
  }

  collectNames(data, { items, stores, meals, books });

  const itemMap = buildMap(items);
  const storeMap = buildMap(stores);
  const mealMap = buildMap(meals);
  const bookMap = buildMap(books);
  const maps = { items: itemMap.map, stores: storeMap.map, meals: mealMap.map, books: bookMap.map };

  const converted = replaceNames(data, maps);

  const final = {};
  for (const { itemName, storeName } of finalEntries) {
    final[itemMap.map[itemName]] = storeMap.map[storeName];
  }

  const selected = {};
  for (const { itemName, storeName, data: val } of selectedEntries) {
    const itemId = itemMap.map[itemName];
    const storeId = storeMap.map[storeName];
    if (!selected[itemId]) selected[itemId] = {};
    selected[itemId][storeId] = replaceNames(val, maps);
  }

  converted.items = Object.fromEntries(itemMap.arr.map((n, i) => [i + 1, n]));
  converted.stores = Object.fromEntries(storeMap.arr.map((n, i) => [i + 1, n]));
  converted.meals = Object.fromEntries(mealMap.arr.map((n, i) => [i + 1, n]));
  converted.recipeBooks = Object.fromEntries(bookMap.arr.map((n, i) => [i + 1, n]));
  converted.final = final;
  converted.selected = selected;

  const outFile = 'grocery_backup_compact.json';
  fs.writeFileSync(outFile, JSON.stringify(converted));
  console.log(`Wrote ${outFile}`);
}

main();

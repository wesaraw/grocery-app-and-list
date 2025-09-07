#!/usr/bin/env node
const fs = require('fs');

const [,, inputPath, outputPath = 'migrated.json'] = process.argv;
if (!inputPath) {
  console.error('Usage: node scripts/migrate-v1-data.js <backup-file> [output-file]');
  process.exit(1);
}

function readBackup(path) {
  const text = fs.readFileSync(path, 'utf8');
  return JSON.parse(text);
}

const data = readBackup(inputPath);
const warnings = new Map();

function warn(msg) {
  warnings.set(msg, (warnings.get(msg) || 0) + 1);
}

const itemNameMap = { ...(data.itemNameMap || {}) };
function getItemId(name) {
  if (itemNameMap[name]) return itemNameMap[name];
  const id = String(Object.keys(itemNameMap).length + 1);
  itemNameMap[name] = id;
  return id;
}

const items = {};
const ITEM_SCHEMA = { scraped: 'array', selected: 'object', finalStore: 'string' };
function addItem(id, field, value) {
  const item = items[id] || (items[id] = {});
  item[field] = value;
}

const meals = [];
const MEAL_FIELDS = new Set(['type','active','ingredients','name','people','prepAhead','prepared','recipeBook','totalCost','users','groupMeal']);

for (const [key, value] of Object.entries(data)) {
  if (key === 'itemNameMap') continue;

  if (key.startsWith('final_product_')) {
    const name = key.slice('final_product_'.length);
    const id = getItemId(name);
    addItem(id, 'selected', value);
    continue;
  }

  const match = key.match(/^(scraped|selected|final)_(.+)$/);
  if (match) {
    const [, prefix, name] = match;
    const id = getItemId(name);
    const field = prefix === 'final' ? 'finalStore' : prefix;
    if (prefix === 'scraped' && !Array.isArray(value)) {
      warn(`items.${id}.scraped should be array`);
    }
    addItem(id, field, value);
    continue;
  }

  const mealMatch = key.match(/^(.*)Meals$/);
  if (mealMatch && Array.isArray(value)) {
    const type = mealMatch[1];
    value.forEach((meal, idx) => {
      const m = { type, ...meal };
      for (const field of Object.keys(m)) {
        if (!MEAL_FIELDS.has(field)) warn(`meals.${field} unknown field`);
      }
      if (typeof m.name !== 'string') warn('meals.name missing or not string');
      if (!Array.isArray(m.ingredients)) warn('meals.ingredients should be array');
      meals.push(m);
    });
    continue;
  }

  warn(`Unhandled top-level key: ${key}`);
}

for (const [id, item] of Object.entries(items)) {
  for (const [field, val] of Object.entries(item)) {
    const expected = ITEM_SCHEMA[field];
    if (!expected) {
      warn(`items.${id}.${field} unknown field`);
      continue;
    }
    if (expected === 'array' && !Array.isArray(val)) {
      warn(`items.${id}.${field} should be array`);
    }
    if (expected === 'object' && (val === null || Array.isArray(val) || typeof val !== 'object')) {
      warn(`items.${id}.${field} should be object`);
    }
    if (expected === 'string' && typeof val !== 'string') {
      warn(`items.${id}.${field} should be string`);
    }
  }
}

const output = { items, itemNameMap, meals };
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

if (warnings.size) {
  console.warn('Warnings:');
  for (const [msg, count] of warnings.entries()) {
    console.warn('-', msg + (count > 1 ? ` (x${count})` : ''));
  }
}

console.log(`Migration complete: ${outputPath}`);

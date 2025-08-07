import Dexie from '../../node_modules/dexie/dist/dexie.mjs';
import { db } from '../db.js';
import { getItemId, getItemName } from './itemRegistry.js';

export async function loadConsumptionHistory() {
  const records = await db.history.where('type').equals('consumption').toArray();
  const map = {};
  for (const rec of records) {
    const name = await getItemName(rec.itemId);
    (map[name] = map[name] || []).push({
      id: rec.id,
      date: rec.date,
      diff: rec.diff,
      week: rec.week
    });
  }
  return map;
}

export async function addConsumptionRecord(name, diff, week) {
  const itemId = await getItemId(name);
  const timestamp = Date.now();
  const id = `${timestamp}-${Math.random().toString(36).slice(2)}`;
  const date = new Date(timestamp).toLocaleDateString();
  await db.history.put({ id, itemId, type: 'consumption', diff, week, timestamp, date });
  return { id, date };
}

export async function removeHistoryEntry(id) {
  await db.history.delete(id);
}

export async function deleteHistoryForItem(itemId) {
  await db.history
    .where('[itemId+type]')
    .between([itemId, Dexie.minKey], [itemId, Dexie.maxKey])
    .delete();
}

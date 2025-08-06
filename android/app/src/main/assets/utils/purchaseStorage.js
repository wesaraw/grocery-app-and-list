import { db } from '../db.js';
import { getItemId, getItemName } from './itemRegistry.js';

export async function loadPurchasesById() {
  const records = await db.history.where('type').equals('purchase').toArray();
  const byId = {};
  for (const rec of records) {
    (byId[rec.itemId] = byId[rec.itemId] || []).push({
      purchase_week: rec.purchase_week,
      quantity_purchased: rec.quantity_purchased,
      date_added: rec.date,
      manual_expiration_override: rec.manual_expiration_override,
      id: rec.id
    });
  }
  return byId;
}

export async function loadPurchases() {
  const byId = await loadPurchasesById();
  const result = {};
  for (const [id, arr] of Object.entries(byId)) {
    const name = await getItemName(id);
    result[name] = arr;
  }
  return result;
}

export async function savePurchases(purchases) {
  for (const [key, arr] of Object.entries(purchases)) {
    const itemId = isNaN(parseInt(key, 10)) ? await getItemId(key) : key;
    await db.history
      .where('itemId')
      .equals(itemId)
      .and(r => r.type === 'purchase')
      .delete();
    const records = [];
    for (const p of arr) {
      const timestamp = p.date_added ? new Date(p.date_added).getTime() : Date.now();
      const id = p.id || `${timestamp}-${Math.random().toString(36).slice(2)}`;
      const date = p.date_added || new Date(timestamp).toISOString();
      records.push({
        id,
        itemId,
        type: 'purchase',
        timestamp,
        date,
        purchase_week: p.purchase_week,
        quantity_purchased: p.quantity_purchased,
        manual_expiration_override: p.manual_expiration_override
      });
    }
    if (records.length) await db.history.bulkPut(records);
  }
}

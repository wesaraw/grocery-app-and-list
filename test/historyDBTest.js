import 'fake-indexeddb/auto';
import { db, exportAll, importAll } from '../db.js';
import { savePurchases, loadPurchases } from '../utils/purchaseStorage.js';
import { addConsumptionRecord, loadConsumptionHistory } from '../utils/historyStorage.js';

async function run() {
  await db.delete();
  await db.open();

  await savePurchases({ Soup: [{ purchase_week: 1, quantity_purchased: 2 }] });
  await addConsumptionRecord('Soup', 1, 1);

  let purchases = await loadPurchases();
  let history = await loadConsumptionHistory();
  if (!purchases.Soup || purchases.Soup[0].quantity_purchased !== 2) {
    throw new Error('Purchase not saved');
  }
  if (!history.Soup || history.Soup[0].diff !== 1) {
    throw new Error('History not saved');
  }

  const dump = await exportAll();
  await db.delete();
  await db.open();
  await importAll(dump);

  purchases = await loadPurchases();
  history = await loadConsumptionHistory();
  if (!purchases.Soup || purchases.Soup[0].quantity_purchased !== 2) {
    throw new Error('Purchase not restored');
  }
  if (!history.Soup || history.Soup[0].diff !== 1) {
    throw new Error('History not restored');
  }
  console.log('history DB test passed');
}

await run();

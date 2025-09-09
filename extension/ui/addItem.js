import { get as storageGet, set as storageSet } from '../../src/services/storageService.js';

function getCurrentWeek() {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const today = new Date();
  return Math.ceil(((today - start) / 86400000 + start.getDay() + 1) / 7);
}

document.getElementById('commit').addEventListener('click', async () => {
  const name = document.getElementById('name').value.trim();
  const category = document.getElementById('category').value.trim();
  const store = document.getElementById('store').value.trim();
  const qty = parseFloat(document.getElementById('qty').value);
  const unit = document.getElementById('unit').value.trim() || 'oz';
  const purchaseUnit = document.getElementById('purchase-unit').value.trim() || unit;
  const conversion = parseFloat(document.getElementById('conversion').value) || 1;
  const yearlyNeedStr = document.getElementById('yearly-need').value;
  const ratioStr = document.getElementById('ratio').value;
  const shelfLifeStr = document.getElementById('shelf-life').value;
  const yearlyNeed = parseFloat(yearlyNeedStr);
  const volumeWeightRatio = parseFloat(ratioStr);
  const shelfLifeWeeks = parseFloat(shelfLifeStr);

  if (
    !name ||
    !category ||
    !store ||
    !Number.isFinite(qty) ||
    qty <= 0 ||
    (yearlyNeedStr && (!Number.isFinite(yearlyNeed) || yearlyNeed <= 0)) ||
    (ratioStr && (!Number.isFinite(volumeWeightRatio) || volumeWeightRatio <= 0)) ||
    (shelfLifeStr && (!Number.isFinite(shelfLifeWeeks) || shelfLifeWeeks < 0))
  ) {
    document.getElementById('warning').style.display = 'block';
    return;
  }

  const items = await storageGet('items', []);
  const id = crypto.randomUUID();
  const week = getCurrentWeek();
  const stockQty = qty * conversion;

  const newItem = {
    id,
    name,
    category,
    unit,
    uom: unit,
    defaultStore: store,
    purchaseUnit,
    unitsPerPurchase: conversion,
    volumeWeightRatio: Number.isFinite(volumeWeightRatio) ? volumeWeightRatio : 1,
    shelfLifeWeeks: Number.isFinite(shelfLifeWeeks) ? shelfLifeWeeks : 0,
    consumptionPlan: {
      yearly: Number.isFinite(yearlyNeed) ? yearlyNeed : 0,
      monthly: Number.isFinite(yearlyNeed) ? yearlyNeed / 12 : 0
    },
    purchases: [
      {
        purchase_week: week,
        quantity_purchased: stockQty,
        date_added: new Date().toISOString()
      }
    ],
    currentStockByWeek: { [week]: stockQty },
    version: 1
  };

  items.push(newItem);
  await storageSet('items', items);
  window.close();
});

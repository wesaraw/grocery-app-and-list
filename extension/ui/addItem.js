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

  if (!name || !category || !store || !Number.isFinite(qty) || qty <= 0) {
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
    defaultStore: store,
    purchaseUnit,
    unitsPerPurchase: conversion,
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

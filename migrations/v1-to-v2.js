export function migrateItemV1(item) {
  return {
    id: item.id || item.name,
    name: item.name || '',
    category: item.category || '',
    uom: item.unit || item.uom || 'Oz',
    volumeWeightRatio: typeof item.density === 'number' ? item.density : 1,
    treatAsWholeUnit: Boolean(item.treatAsWholeUnit || item.treat_as_whole_unit),
    shelfLifeWeeks: item.shelfLifeWeeks ?? (item.shelf_life_months ? item.shelf_life_months * 4 : 0),
    seasonRanges: Array.isArray(item.seasonRanges) ? item.seasonRanges : [],
    currentStockByWeek: item.currentStockByWeek || {},
    consumptionPlan: item.consumptionPlan || { monthly: item.monthly_consumption || 0, yearly: item.total_needed_year || 0 },
    version: 2,
  };
}

export function migrateStoreProductsV1(data) {
  const products = [];
  for (const [key, value] of Object.entries(data)) {
    const match = key.match(/^(scraped|selected|final)_(.+)$/);
    if (!match) continue;
    const [, , itemId] = match;
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      products.push({
        itemId,
        store: entry.store || entry.storeName || '',
        url: entry.url || '',
        scrapedAt: entry.scrapedAt || Date.now(),
        price: entry.price || 0,
        unitCost: entry.unitCost || entry.unit_price || 0,
        image: entry.image || '',
        version: 2,
      });
    }
  }
  return products;
}

export function migrateDataV1(data) {
  const itemsArray = Array.isArray(data.items) ? data.items : [];
  const items = itemsArray.map(migrateItemV1);
  const storeProducts = migrateStoreProductsV1(data);
  return { 'item-data': items, 'store-products': storeProducts };
}

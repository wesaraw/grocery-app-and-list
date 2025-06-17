export function getStockForWeek(stock, purchases, week) {
  const map = new Map(stock.map(item => [item.name, item.amount]));
  for (const [name, list] of Object.entries(purchases || {})) {
    let amt = map.get(name) || 0;
    for (const p of list) {
      if (p.purchase_week <= week) {
        amt += p.quantity_purchased;
      }
    }
    map.set(name, amt);
  }
  return map;
}

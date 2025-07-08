export const SHEET_SQFT = 0.111;

export function parseUnitPrice(text) {
  if (!text) return null;
  text = text.replace(/[()]/g, '');
  let m = text.match(/\$([\d.]+)\s*\/\s*(\d+)([a-zA-Z]+)/);
  let priceVal = null;
  let qtyVal = null;
  let unitType = null;
  if (m) {
    priceVal = parseFloat(m[1]);
    qtyVal = parseFloat(m[2]);
    unitType = m[3].toLowerCase();
  } else {
    m = text.match(/\$([\d.]+)\s*\/\s*([\d.]*)\s*([a-zA-Z]+(?:\s*[a-zA-Z]+)?)/);
    if (m) {
      priceVal = parseFloat(m[1]);
      qtyVal = parseFloat(m[2]);
      unitType = m[3].toLowerCase().replace(/\s+/g, '');
    } else {
    m = text.match(/([\d.]+)\s*¢\s*\/\s*([\d.]*)\s*([a-zA-Z]+(?:\s*[a-zA-Z]+)?)/);
    if (m) {
      priceVal = parseFloat(m[1]) / 100;
      qtyVal = parseFloat(m[2]);
      unitType = m[3].toLowerCase().replace(/\s+/g, '');
    } else {
      m = text.match(/price\s*per\s*(\d+(?:\.\d+)?)([a-zA-Z]+)\s*\$([\d.]+)/i);
      if (m) {
        qtyVal = parseFloat(m[1]);
        unitType = m[2].toLowerCase();
        priceVal = parseFloat(m[3]);
      } else {
        m = text.match(/price\s*per\s*([\d.]+)\s*([a-zA-Z]+)\s*\$([\d.]+)/i);
        if (m) {
          qtyVal = parseFloat(m[1]);
          unitType = m[2].toLowerCase();
          priceVal = parseFloat(m[3]);
        } else {
          m = text.match(/([\d.]+)\s*\/\s*([\d.]*)\s*([a-zA-Z]+(?:\s*[a-zA-Z]+)?)/);
          if (m) {
            priceVal = parseFloat(m[1]);
            qtyVal = parseFloat(m[2]);
            unitType = m[3].toLowerCase().replace(/\s+/g, '');
          }
        }
      }
    }
  }
  if (!m || isNaN(priceVal)) return null;
  const qty = !isNaN(qtyVal) && qtyVal !== 0 ? qtyVal : 1;
  return { pricePerUnit: priceVal / qty, unitType, unitQty: qty };
}

export function getPriceUnitInfo(product) {
  if (product.pricePerUnit != null && product.unitType) {
    return { pricePerUnit: product.pricePerUnit, unitType: product.unitType };
  }
  const parsed = parseUnitPrice(product.unit);
  if (parsed) return parsed;
  return { pricePerUnit: null, unitType: null };
}

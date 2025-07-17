import { getPriceUnitInfo, sheetSqFtFor } from './priceUtils.js';
import { canonicalName } from './nameUtils.js';
import { parseQuantity } from './calendarUtils.js';
import { convert } from './uomConverter.js';
import { convertWithDensity, loadDensityMap } from './unitNormalize.js';
import { loadJSON } from './dataLoader.js';

const NEEDS_PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
let needsMap = new Map();
let densityMap = {};
let initialized = false;

async function init() {
  if (initialized) return;
  const [needs, density] = await Promise.all([
    loadJSON(NEEDS_PATH).catch(() => []),
    loadDensityMap()
  ]);
  needsMap = new Map(needs.map(n => [canonicalName(n.name), n]));
  densityMap = density;
  initialized = true;
}

function loadFinalProduct(item) {
  return new Promise(resolve => {
    const key = `final_product_${encodeURIComponent(item)}`;
    chrome.storage.local.get([key], data => resolve(data[key] || null));
  });
}

export async function getItemAndProduct(ingredient) {
  if (!ingredient) return { item: null, product: null };
  const { item: itemKey, name } = ingredient;
  const lookup = itemKey || name;
  if (!lookup) return { item: null, product: null };
  const item = needsMap.get(canonicalName(lookup));
  let product = null;
  if (name) product = await loadFinalProduct(name);
  if (!product && itemKey) product = await loadFinalProduct(itemKey);
  return { item, product };
}

function pricePerHomeUnit(item, product) {
  if (!item || !product || product.priceNumber == null) return null;
  const info = densityMap[item.name] || {};
  const pack = product.packCount && product.packCount > 1 ? product.packCount : 1;
  const unit = item.home_unit ? item.home_unit.toLowerCase() : 'each';
  if (unit === 'sheets') {
    const sheetSqFt = sheetSqFtFor(item.name);
    const { pricePerUnit: ppu, unitType: ut } = getPriceUnitInfo(product);
    if (ppu != null && ut) {
      if (/^(?:sf|sqft)$/.test(ut)) return ppu * sheetSqFt;
      if (/ct|count|sheet/.test(ut)) return ppu;
    }
    const totalSheets =
      product.sizeQty && /sheet/i.test(product.sizeUnit || '')
        ? product.sizeQty
        : null;
    if (totalSheets) return product.priceNumber / (totalSheets * pack);
  }
  if (unit === 'each') return product.priceNumber / pack;
  let { pricePerUnit: pricePerOz, unitType } = getPriceUnitInfo(product);
  if (pricePerOz == null) {
    let ozQty = null;
    if (product.convertedQty != null) {
      ozQty = product.convertedQty * pack;
    } else if (product.sizeQty != null && product.sizeUnit) {
      ozQty = convertWithDensity(
        product.sizeQty * pack,
        product.sizeUnit,
        'oz',
        { convert_volume_to_weight: info.convert, custom_density_ratio: info.ratio }
      );
    }
    if (ozQty != null) pricePerOz = product.priceNumber / ozQty;
  } else if (unitType && unitType !== 'oz') {
    const conv = convertWithDensity(1, unitType, 'oz', {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
    if (!isNaN(conv) && conv > 0) pricePerOz = pricePerOz / conv;
  }
  if (pricePerOz != null) {
    const ozPerUnit = convertWithDensity(1, item.home_unit, 'oz', {
      convert_volume_to_weight: info.convert,
      custom_density_ratio: info.ratio
    });
    if (!isNaN(ozPerUnit) && ozPerUnit > 0) return pricePerOz * ozPerUnit;
  }
  return null;
}

export async function computeMealCost(meal) {
  await init();
  if (!meal || !Array.isArray(meal.ingredients)) return null;
  const saved = parseFloat(meal.totalCost);
  if (!isNaN(saved)) return saved;
  let total = 0;
  for (const ing of meal.ingredients) {
    if (!ing.amount) continue;
    const { item, product } = await getItemAndProduct(ing);
    if (!item || !product) continue;
    const info = getPriceUnitInfo(product);
    const unitPrice = pricePerHomeUnit(item, product);
    if (unitPrice == null && !(info.unitType === 'fl oz' && info.pricePerUnit != null)) continue;
    const { value, unit } = parseQuantity(ing.amount || ing.serving_size || '');
    if (!value) continue;
    let qty = value;
    if (unit && item.home_unit && unit.toLowerCase() !== item.home_unit.toLowerCase()) {
      const dInfo = densityMap[item.name] || {};
      qty = convertWithDensity(value, unit, item.home_unit, {
        convert_volume_to_weight: dInfo.convert,
        custom_density_ratio: dInfo.ratio
      });
    }
    if (qty == null || isNaN(qty)) continue;
    if (info.unitType === 'fl oz' && info.pricePerUnit != null) {
      const fromUnit = item.home_unit || unit;
      const flozQty = convert(qty, fromUnit, 'fl oz');
      if (!isNaN(flozQty)) {
        total += info.pricePerUnit * flozQty;
        continue;
      }
    }
    total += unitPrice * qty;
  }
  return total;
}

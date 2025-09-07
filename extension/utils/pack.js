import { convertWithDensity } from './unit.js';

export function calculatePackUnits(item, product, packQty) {
  if (!product || typeof packQty !== 'number' || isNaN(packQty)) return null;
  const uom = (item.uom || '').toLowerCase();
  if (uom === 'each') {
    const count = product.count ?? product.sizeQty ?? 1;
    return packQty * count;
  }
  let ozQty = null;
  if (product.convertedQty != null) {
    ozQty = product.convertedQty * packQty;
  } else if (product.sizeQty != null && product.sizeUnit) {
    ozQty = convertWithDensity(
      product.sizeQty * packQty,
      product.sizeUnit,
      'oz',
      { convert_volume_to_weight: true, custom_density_ratio: item.volumeWeightRatio }
    );
  }
  if (ozQty == null) return null;
  return convertWithDensity(
    ozQty,
    'oz',
    item.uom,
    { convert_volume_to_weight: true, custom_density_ratio: item.volumeWeightRatio }
  );
}

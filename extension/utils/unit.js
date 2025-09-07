export function convertWithDensity(qty, fromUnit, toUnit = 'oz', settings = {}) {
  if (qty == null) return null;
  fromUnit = (fromUnit || '').toLowerCase();
  toUnit = (toUnit || '').toLowerCase();
  if (!fromUnit || !toUnit) return qty;
  const ratio = settings.custom_density_ratio ?? 1;
  const volumeToMl = { ml: 1, l: 1000, 'fl oz': 29.5735, floz: 29.5735 };
  const weightToOz = { oz: 1, lb: 16, g: 0.035274, kg: 35.274 };
  const isVolume = u => Object.prototype.hasOwnProperty.call(volumeToMl, u);
  const isWeight = u => Object.prototype.hasOwnProperty.call(weightToOz, u);

  if (settings.convert_volume_to_weight && isVolume(fromUnit) && isWeight(toUnit)) {
    const ml = qty * volumeToMl[fromUnit];
    const oz = (ml * ratio) / 28.35;
    if (toUnit === 'oz') return oz;
    return oz / weightToOz[toUnit];
  }

  if (isWeight(fromUnit) && isWeight(toUnit)) {
    const oz = qty * weightToOz[fromUnit];
    return toUnit === 'oz' ? oz : oz / weightToOz[toUnit];
  }

  if (isVolume(fromUnit) && isVolume(toUnit)) {
    const ml = qty * volumeToMl[fromUnit];
    return ml / volumeToMl[toUnit];
  }

  return qty;
}

export function unitNormalize(uom = '') {
  let u = uom.trim().toLowerCase();
  const aliases = {
    lbs: 'lb',
    pound: 'lb',
    pounds: 'lb',
    ounce: 'oz',
    ounces: 'oz',
    floz: 'fl oz'
  };
  return aliases[u] || u;
}

import { normalizeUnit, convertToWeightFromVolume } from '../utils/unitNormalize.js';

// normalize without conversion
let res = normalizeUnit({}, '473 mL');
if (res.unit !== 'fl oz' || Math.abs(res.quantity - 16) > 0.1) {
  throw new Error('Failed basic volume normalization');
}

// normalize with conversion using density 1
res = normalizeUnit({ convert_volume_to_weight: true }, '473 mL');
if (res.unit !== 'oz' || Math.abs(res.quantity - 16.68) > 0.1) {
  throw new Error('Failed volume to weight conversion');
}

const w = convertToWeightFromVolume(240, 0.92);
if (Math.abs(w - 7.79) > 0.1) {
  throw new Error('convertToWeightFromVolume incorrect');
}

console.log('unitNormalize tests passed');

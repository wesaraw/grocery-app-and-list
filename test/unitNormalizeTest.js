import { normalizeUnit, convertToWeightFromVolume } from '../utils/unitNormalize.js';
import { parseQuantity } from '../utils/calendarUtils.js';
import { initUomTable, convert } from '../utils/uomConverter.js';
import { pathToFileURL } from 'url';
import fs from 'fs';
global.chrome = { runtime: { getURL: p => pathToFileURL(process.cwd() + '/' + p).href } };
global.fetch = async url => ({ json: async () => JSON.parse(fs.readFileSync(new URL(url), 'utf8')) });

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

await initUomTable();
const q = parseQuantity('1');
if (q.value !== 1 || q.unit !== 'ea') {
  throw new Error('parseQuantity default each failed');
}
const eggs = convert(1, 'doz', 'ea');
if (eggs !== 12) {
  throw new Error('dozen conversion failed');
}

const pintToOz = convert(1, 'pint', 'oz');
if (pintToOz !== 16) {
  throw new Error('pint conversion failed');
}

console.log('unitNormalize tests passed');

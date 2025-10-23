import {
  normalizeUnit,
  convertToWeightFromVolume,
  computeNormalizedQuantity,
  convertWithDensity
} from '../utils/unitNormalize.js';
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

const densitySettings = {
  convert_volume_to_weight: true,
  custom_density_ratio: 26.36 / 240
};

const ozFromCup = convertWithDensity(1, 'cup', 'oz', densitySettings);
if (Math.abs(ozFromCup - 0.93) > 0.02) {
  throw new Error('density conversion cup -> oz failed');
}

const cupFromOz = convertWithDensity(0.93, 'oz', 'cup', densitySettings);
if (Math.abs(cupFromOz - 1) > 0.05) {
  throw new Error('density conversion oz -> cup failed');
}

const q = parseQuantity('1');
if (q.value !== 1 || q.unit !== 'ea') {
  throw new Error('parseQuantity default each failed');
}
const eggs = convert(1, 'doz', 'ea');
if (eggs !== 12) {
  throw new Error('dozen conversion failed');
}

const pintOz = convert(1, 'pint', 'oz');
if (pintOz !== 16) {
  throw new Error('pint conversion failed');
}

const cheeseSettings = {
  normalized: {
    fromUnit: 'oz',
    fromValue: 16,
    toUnit: 'slice',
    toValue: 20
  }
};

const normalizedCheese = computeNormalizedQuantity(3, 'oz', cheeseSettings);
if (
  !normalizedCheese ||
  normalizedCheese.unit !== 'slice' ||
  Math.abs(normalizedCheese.quantity - 3.75) > 0.01
) {
  throw new Error('normalized conversion failed');
}

const skipSameUnit = computeNormalizedQuantity(3, 'slice', cheeseSettings);
if (skipSameUnit !== null) {
  throw new Error('should skip normalization when units already match');
}

const missingNormalized = computeNormalizedQuantity(3, 'oz', {
  normalized: { fromUnit: 'oz', fromValue: 16 }
});
if (missingNormalized !== null) {
  throw new Error('normalization should be ignored when mapping incomplete');
}

const quinoaSettings = {
  prepState: 'cooked',
  normalized: {
    fromUnit: 'cup',
    fromValue: 2,
    toUnit: 'cup',
    toValue: 1,
    fromState: 'cooked',
    toState: 'dry'
  }
};

const cookedToDry = computeNormalizedQuantity(2, 'cup', quinoaSettings);
if (
  !cookedToDry ||
  cookedToDry.unit !== 'cup Dry' ||
  Math.abs(cookedToDry.quantity - 1) > 0.0001
) {
  throw new Error('cooked to dry conversion failed');
}

const mismatchedPrepState = computeNormalizedQuantity(2, 'cup', {
  prepState: 'dry',
  normalized: quinoaSettings.normalized
});
if (mismatchedPrepState !== null) {
  throw new Error('normalization should be skipped when prep state does not match mapping');
}

const missingPrepState = computeNormalizedQuantity(2, 'cup', {
  normalized: quinoaSettings.normalized
});
if (missingPrepState !== null) {
  throw new Error('normalization should require a matching prep state when mapping uses states');
}

const missingToStateMapping = computeNormalizedQuantity(3, 'oz', {
  normalized: {
    fromUnit: 'oz',
    fromValue: 3,
    toUnit: 'cup',
    toValue: 1,
    fromState: 'cooked'
  }
});
if (missingToStateMapping !== null) {
  throw new Error('normalization should require both cooked/dry states when provided');
}

const invalidStateMapping = computeNormalizedQuantity(3, 'oz', {
  normalized: {
    fromUnit: 'oz',
    fromValue: 3,
    toUnit: 'cup',
    toValue: 1,
    fromState: 'cooked',
    toState: 'raw'
  }
});
if (invalidStateMapping !== null) {
  throw new Error('normalization should reject invalid cooked/dry states');
}

const missingFromStateMapping = computeNormalizedQuantity(3, 'oz', {
  normalized: {
    fromUnit: 'oz',
    fromValue: 3,
    toUnit: 'cup',
    toValue: 1,
    toState: 'dry'
  }
});
if (missingFromStateMapping !== null) {
  throw new Error('normalization should require the cooked/dry source state when provided');
}

const sameStateMapping = computeNormalizedQuantity(2, 'cup', {
  prepState: 'cooked',
  normalized: {
    fromUnit: 'cup',
    fromValue: 1,
    toUnit: 'cup',
    toValue: 1,
    fromState: 'cooked',
    toState: 'cooked'
  }
});
if (sameStateMapping !== null) {
  throw new Error('normalization should be skipped when cooked/dry states already match');
}

console.log('unitNormalize tests passed');

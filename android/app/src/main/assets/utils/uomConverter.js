import { loadJSON } from './dataLoader.js';
import { roundQuantity } from './quantityFormat.js';

const UOM_TABLE_PATH = 'Required for grocery app/uom_conversion_table.json';
let table = null;
const BASE_UNIT = 'oz';
const ALIAS_MAP = {
  gallon: 'gal',
  gallons: 'gal',
  ounce: 'oz',
  ounces: 'oz',
  floz: 'fl oz',
  fluidounce: 'fl oz',
  each: 'ea',
  dozen: 'doz',
  doz: 'doz',
  'halfdoz': 'halfdoz',
  'half-doz': 'halfdoz',
  halfdozen: 'halfdoz',
  'half-dozen': 'halfdoz',
  pint: 'pt',
  pints: 'pt',
  perpint: 'pt',
  'per pint': 'pt',
  'per-pint': 'pt'
};

export async function initUomTable() {
  try {
    table = await loadJSON(UOM_TABLE_PATH);
  } catch (e) {
    table = {};
  }
}

export function convert(value, fromUnit, toUnit = BASE_UNIT) {
  if (value == null) return value;
  if (!table) return roundQuantity(value);
  if (!fromUnit || !toUnit) return roundQuantity(value);
  let fromKey = fromUnit.toLowerCase();
  let toKey = toUnit.toLowerCase();
  fromKey = ALIAS_MAP[fromKey] || fromKey;
  toKey = ALIAS_MAP[toKey] || toKey;
  const fromFactor = table[fromKey];
  const toFactor = table[toKey];
  if (fromFactor === undefined || toFactor === undefined) return roundQuantity(value);
  const converted = (value * fromFactor) / toFactor;
  return roundQuantity(converted);
}

export { BASE_UNIT };

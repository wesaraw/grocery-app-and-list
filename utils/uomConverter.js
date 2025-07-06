import { loadJSON } from './dataLoader.js';

const UOM_TABLE_PATH = 'Required for grocery app/uom_conversion_table.json';
let table = null;
const BASE_UNIT = 'oz';
const ALIAS_MAP = {
  gallon: 'gal',
  gallons: 'gal',
  ounce: 'oz',
  ounces: 'oz',
  each: 'ea'
};

export async function initUomTable() {
  try {
    table = await loadJSON(UOM_TABLE_PATH);
  } catch (e) {
    table = {};
  }
}

export function convert(value, fromUnit, toUnit = BASE_UNIT) {
  if (!table) return value;
  if (!fromUnit || !toUnit) return value;
  let fromKey = fromUnit.toLowerCase();
  let toKey = toUnit.toLowerCase();
  fromKey = ALIAS_MAP[fromKey] || fromKey;
  toKey = ALIAS_MAP[toKey] || toKey;
  const fromFactor = table[fromKey];
  const toFactor = table[toKey];
  if (fromFactor === undefined || toFactor === undefined) return value;
  return (value * fromFactor) / toFactor;
}

export { BASE_UNIT };

import { loadJSON } from './dataLoader.js';

const UOM_TABLE_PATH = 'Required for grocery app/uom_conversion_table.json';
let table = null;
const BASE_UNIT = 'oz';

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
  const fromKey = fromUnit.toLowerCase();
  const toKey = toUnit.toLowerCase();
  const fromFactor = table[fromKey];
  const toFactor = table[toKey];
  if (fromFactor === undefined || toFactor === undefined) return value;
  return (value * fromFactor) / toFactor;
}

export { BASE_UNIT };

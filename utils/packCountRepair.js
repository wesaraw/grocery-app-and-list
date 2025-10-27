import { roundQuantity, formatQuantity } from './quantityFormat.js';

const WEIGHT_VOLUME_UNITS = new Set([
  'oz',
  'ounce',
  'ounces',
  'lb',
  'lbs',
  'pound',
  'pounds',
  'g',
  'gram',
  'grams',
  'kg',
  'kilogram',
  'kilograms',
  'ml',
  'milliliter',
  'milliliters',
  'l',
  'liter',
  'liters',
  'litre',
  'litres',
  'fl oz',
  'floz',
  'qt',
  'quart',
  'quarts',
  'pt',
  'pint',
  'pints',
  'gal',
  'gallon',
  'gallons',
  'cup',
  'cups',
  'tbsp',
  'tablespoon',
  'tablespoons',
  'tsp',
  'teaspoon',
  'teaspoons'
]);

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return NaN;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

function normalizeUnit(unit) {
  if (typeof unit !== 'string') return '';
  return unit.trim().toLowerCase().replace(/\.+/g, '').replace(/\s+/g, ' ');
}

function isWeightOrVolumeUnit(unit) {
  const normalized = normalizeUnit(unit);
  return normalized !== '' && WEIGHT_VOLUME_UNITS.has(normalized);
}

function approxEqual(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  const tolerance = Math.max(0.01, Math.abs(b) * 0.01);
  return diff <= tolerance;
}

function chooseExpectedTotal({ priceNumber, pricePerUnit }) {
  const price = toNumber(priceNumber);
  const perUnit = toNumber(pricePerUnit);
  if (price > 0 && perUnit > 0) {
    return price / perUnit;
  }
  return NaN;
}

export function analyzeFinalProductForRepair(product) {
  if (!product || typeof product !== 'object') {
    return { shouldRepair: false };
  }

  const packCount = toNumber(product.packCount);
  if (!(packCount > 1)) {
    return { shouldRepair: false };
  }

  const sizeUnit = product.sizeUnit ?? product.unitType ?? '';
  if (!isWeightOrVolumeUnit(sizeUnit)) {
    return { shouldRepair: false };
  }

  const sizeQty = toNumber(product.sizeQty);
  const convertedQty = toNumber(product.convertedQty);
  const perPackFromSize = Number.isFinite(sizeQty) ? sizeQty / packCount : NaN;
  const perPackFromConverted = Number.isFinite(convertedQty) ? convertedQty / packCount : NaN;
  const expectedTotal = chooseExpectedTotal(product);
  const observedTotal = Number.isFinite(sizeQty)
    ? sizeQty
    : Number.isFinite(convertedQty)
      ? convertedQty
      : NaN;

  if (Number.isFinite(expectedTotal)) {
    if (approxEqual(observedTotal, expectedTotal)) {
      return { shouldRepair: false };
    }
    if (approxEqual(observedTotal, expectedTotal * packCount)) {
      return {
        shouldRepair: true,
        correctedTotal: Number.isFinite(perPackFromSize) ? perPackFromSize : expectedTotal,
        reason: 'pricePerUnit'
      };
    }
  }

  if (!Number.isFinite(sizeQty)) {
    return { shouldRepair: false };
  }

  if (!Number.isFinite(perPackFromSize) || perPackFromSize <= 0) {
    return { shouldRepair: false };
  }

  if (approxEqual(sizeQty, perPackFromSize)) {
    return { shouldRepair: false };
  }

  if (Number.isFinite(perPackFromConverted) && approxEqual(perPackFromConverted, perPackFromSize)) {
      return {
        shouldRepair: true,
        correctedTotal: perPackFromSize,
        reason: 'convertedQty'
      };
  }

  if (sizeQty > perPackFromSize) {
    return {
      shouldRepair: true,
      correctedTotal: perPackFromSize,
      reason: 'sizeQty'
    };
  }

  return { shouldRepair: false };
}

export function applyPackCountRepair(product) {
  const analysis = analyzeFinalProductForRepair(product);
  if (!analysis.shouldRepair) {
    return { changed: false, product, analysis };
  }

  const correctedTotal = roundQuantity(analysis.correctedTotal);
  const updated = { ...product };

  if (Number.isFinite(correctedTotal)) {
    updated.sizeQty = correctedTotal;

    const hasConvertedQty = Number.isFinite(toNumber(product.convertedQty));
    if (hasConvertedQty || product.convertedQty == null) {
      updated.convertedQty = correctedTotal;
    }

    const unitText = typeof product.sizeUnit === 'string' && product.sizeUnit.trim() !== ''
      ? product.sizeUnit.trim()
      : typeof product.unitType === 'string'
        ? product.unitType.trim()
        : '';

    if (unitText) {
      updated.size = `${formatQuantity(correctedTotal)} ${unitText}`.trim();
    } else {
      updated.size = formatQuantity(correctedTotal);
    }
  }

  return {
    changed: true,
    product: updated,
    analysis,
    correctedQuantity: correctedTotal
  };
}

export function repairFinalProducts(map) {
  const updates = {};
  const summary = [];

  for (const [key, value] of Object.entries(map)) {
    if (!key.startsWith('final_product_') || typeof value !== 'object' || value == null) {
      continue;
    }

    const { changed, product, analysis } = applyPackCountRepair(value);
    if (changed) {
      updates[key] = product;
      summary.push({
        key,
        name: value.name,
        sizeBefore: value.size,
        sizeAfter: product.size,
        reason: analysis.reason
      });
    }
  }

  return { updates, summary };
}

export function hasWeightVolumeUnit(unit) {
  return isWeightOrVolumeUnit(unit);
}

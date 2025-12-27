import { formatQuantity } from '../utils/quantityFormat.js';

function formatQuantityText(quantity) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    return '';
  }
  return formatQuantity(quantity);
}

function hasSizeMeasurement(ingredient) {
  if (!ingredient) return false;
  const hasAmount = typeof ingredient.sizeAmount === 'number' && Number.isFinite(ingredient.sizeAmount);
  const hasUnit = typeof ingredient.sizeUnit === 'string' && ingredient.sizeUnit.trim().length > 0;
  return hasAmount && hasUnit;
}

function buildMeasurementParts(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') {
    return { parts: [], usedSizeMeasurement: false };
  }
  const preferSizeMeasurement = hasSizeMeasurement(ingredient);
  if (preferSizeMeasurement) {
    const formattedSize = formatQuantityText(ingredient.sizeAmount);
    const sizeUnit = ingredient.sizeUnit.trim();
    return {
      parts: [formattedSize, sizeUnit].filter(Boolean),
      usedSizeMeasurement: true,
    };
  }
  const quantityText = formatQuantityText(ingredient.quantity);
  const unitText = typeof ingredient.unit === 'string' ? ingredient.unit.trim() : '';
  return {
    parts: [quantityText, unitText].filter(Boolean),
    usedSizeMeasurement: false,
  };
}

export function formatMealimeIngredientForStorage(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') {
    return ingredient;
  }
  const measurement = buildMeasurementParts(ingredient);
  let combined = measurement.parts.join(' ').replace(/\s+/g, ' ').trim();
  const descriptorText = typeof ingredient.sizeDescriptor === 'string' && ingredient.sizeDescriptor.trim().length > 0
    ? ingredient.sizeDescriptor.trim()
    : '';
  const tailParts = [];
  if (descriptorText) {
    tailParts.push(descriptorText);
  }
  if (tailParts.length) {
    combined = [combined, ...tailParts].filter(Boolean).join(' ').trim();
  }
  const fallback = typeof ingredient.originalText === 'string' ? ingredient.originalText.trim() : '';
  const amount = combined || fallback;
  ingredient.amount = amount;
  ingredient.serving_size = amount;
  return ingredient;
}

export function formatMealimeIngredientsForStorage(list = []) {
  return (Array.isArray(list) ? list : []).map(entry => formatMealimeIngredientForStorage(entry));
}

export default {
  formatMealimeIngredientForStorage,
  formatMealimeIngredientsForStorage,
};

import { formatQuantity } from '../utils/quantityFormat.js';

function buildSizeText(ingredient) {
  if (!ingredient || ingredient.sizeUsedAsMeasurement) return '';
  const hasSizeAmount = typeof ingredient.sizeAmount === 'number' && Number.isFinite(ingredient.sizeAmount);
  const hasSizeUnit = typeof ingredient.sizeUnit === 'string' && ingredient.sizeUnit.trim().length > 0;
  if (!hasSizeAmount && !hasSizeUnit) {
    return '';
  }
  const parts = [];
  if (hasSizeAmount) {
    const formatted = formatQuantity(ingredient.sizeAmount);
    if (formatted) {
      parts.push(formatted);
    }
  }
  if (hasSizeUnit) {
    parts.push(ingredient.sizeUnit.trim());
  }
  const joined = parts.join(' ').trim();
  return joined ? `(${joined})` : '';
}

function formatQuantityText(quantity) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    return '';
  }
  return formatQuantity(quantity);
}

export function formatMealimeIngredientForStorage(ingredient) {
  if (!ingredient || typeof ingredient !== 'object') {
    return ingredient;
  }
  const amountParts = [];
  const quantityText = formatQuantityText(ingredient.quantity);
  if (quantityText) {
    amountParts.push(quantityText);
  }
  const descriptorText = typeof ingredient.sizeDescriptor === 'string' && ingredient.sizeDescriptor.trim().length > 0
    ? ingredient.sizeDescriptor.trim()
    : '';
  if (descriptorText) {
    amountParts.push(descriptorText);
  }
  const unitText = typeof ingredient.unit === 'string' ? ingredient.unit.trim() : '';
  if (unitText) {
    amountParts.push(unitText);
  }
  const sizeText = buildSizeText(ingredient);
  if (sizeText) {
    amountParts.push(sizeText);
  }
  const combined = amountParts.join(' ').replace(/\s+/g, ' ').trim();
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

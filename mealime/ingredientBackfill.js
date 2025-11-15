function keyForWarningLookup(text) {
  return typeof text === 'string' ? text.trim().toLowerCase() : '';
}

export function backfillIngredientsFromSteps(ingredients = [], stepQuantities = []) {
  const resolutionMap = new Map();
  const stepEntries = new Map(
    Array.isArray(stepQuantities)
      ? stepQuantities
          .filter(entry => entry && entry.ingredientName)
          .map(entry => [entry.ingredientName.trim().toLowerCase(), entry])
      : []
  );
  ingredients.forEach(ingredient => {
    if (!ingredient || !ingredient.name) {
      return;
    }
    const key = ingredient.name.trim().toLowerCase();
    const match = stepEntries.get(key);
    if (!match) {
      return;
    }
    const warningKey = keyForWarningLookup(ingredient.originalText || ingredient.name);
    const needsQuantity = ingredient.quantity === null || typeof ingredient.quantity !== 'number';
    const needsUnit = !ingredient.unit;
    const descriptorUnit = ingredient.unit === 'each' && ingredient.sizeDescriptor;
    let resolution = warningKey ? resolutionMap.get(warningKey) : null;
    const markResolved = field => {
      if (!warningKey) return;
      if (!resolution) {
        resolution = { quantity: false, unit: false };
        resolutionMap.set(warningKey, resolution);
      }
      resolution[field] = true;
    };
    let derived = false;
    if (needsQuantity && typeof match.quantity === 'number') {
      ingredient.quantity = match.quantity;
      markResolved('quantity');
      derived = true;
    }
    const shouldOverrideUnit =
      (needsUnit || (descriptorUnit && match.unit && match.unit !== 'each')) && !!match.unit;
    if (shouldOverrideUnit) {
      ingredient.unit = match.unit;
      markResolved('unit');
      derived = true;
    }
    if (derived) {
      ingredient.derivedFromSteps = true;
    }
  });
  return resolutionMap;
}

export function filterResolvedIngredientWarnings(ingredientWarnings = [], resolutionMap = new Map()) {
  return ingredientWarnings.filter(entry => {
    if (!entry || typeof entry !== 'object') {
      return true;
    }
    const key = keyForWarningLookup(entry.ingredient);
    if (!key) {
      return true;
    }
    const resolution = resolutionMap.get(key);
    if (!resolution) {
      return true;
    }
    if (entry.reason === 'quantity' && resolution.quantity) {
      return false;
    }
    if (entry.reason === 'unit' && resolution.unit) {
      return false;
    }
    return true;
  });
}

export default {
  backfillIngredientsFromSteps,
  filterResolvedIngredientWarnings,
};

import { detectUnit, extractQuantity, replaceUnicodeFractions } from './ingredientNormalizer.js';

const QUANTITY_PATTERN = '(?:\\d+\\s+\\d+\/\\d+|\\d+\/\\d+|\\d+(?:\\.\\d+)?|\\.\\d+)';

export function mergeStepQuantities(ingredients = [], stepTexts = []) {
  const clonedIngredients = ingredients.map((ingredient) => (ingredient ? { ...ingredient } : ingredient));
  const warnings = [];
  const cleanedSteps = stepTexts
    .map((text) => (typeof text === 'string' ? collapseWhitespace(replaceUnicodeFractions(text)) : ''))
    .filter(Boolean);

  clonedIngredients.forEach((ingredient, index) => {
    if (!ingredient || ingredient.quantity != null) {
      return;
    }

    const nameForMatching = (ingredient.name || ingredient.originalText || '').trim();
    const patternFragments = buildIngredientPatternFragments(nameForMatching);
    if (!patternFragments.length) {
      return;
    }

    let assignedMatch = null;

    cleanedSteps.forEach((stepText, stepIndex) => {
      const match = findQuantityMatch(stepText, patternFragments);
      if (!match) {
        return;
      }

      const matchWithStep = { ...match, stepIndex };

      if (!assignedMatch) {
        assignedMatch = matchWithStep;
        const normalizedQuantity = normalizeQuantity(match.quantity);
        const updatedUnit = match.unit || ingredient.unit || null;

        clonedIngredients[index] = {
          ...ingredient,
          quantity: match.quantity,
          normalizedQuantity,
          unit: updatedUnit,
          normalizedUnit: updatedUnit,
          stepQuantitySource: stepIndex,
        };
        ingredient = clonedIngredients[index];
        return;
      }

      if (!matchesAreEquivalent(matchWithStep, assignedMatch)) {
        warnings.push(
          `Conflicting step quantities for "${nameForMatching}" between steps ${assignedMatch.stepIndex + 1} and ${stepIndex + 1}.`
        );
      }
    });
  });

  return { ingredients: clonedIngredients, warnings };
}

function findQuantityMatch(stepText, patternFragments) {
  for (const fragment of patternFragments) {
    const regex = new RegExp(`\\b(${QUANTITY_PATTERN})(?:\\s+([a-zA-Z\\.]+(?:\\s+[a-zA-Z\\.]+)?))?\\s+(?:of\\s+)?${fragment}(?:\\b|$)`, 'i');
    const match = stepText.match(regex);
    if (!match) {
      continue;
    }

    const quantityText = match[1];
    const rawUnitText = match[2] || '';

    const { quantity } = extractQuantity(quantityText);
    if (quantity == null || Number.isNaN(quantity)) {
      continue;
    }

    const { unit } = detectUnit(rawUnitText.trim());

    return { quantity, unit: unit || null };
  }

  return null;
}

function buildIngredientPatternFragments(name) {
  const normalized = normalizeText(name);
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(' ');
  const escapedTokens = tokens.map((token) => escapeRegExp(token));
  const fragments = new Set();

  fragments.add(`(?:${escapedTokens.join('\\s+')})`);

  const lastToken = tokens[tokens.length - 1];
  for (const form of buildWordForms(lastToken)) {
    const escapedForm = escapeRegExp(form);
    fragments.add(`(?:${escapedForm})`);
    if (tokens.length > 1) {
      const prefix = escapedTokens.slice(0, -1).join('\\s+');
      if (prefix) {
        fragments.add(`(?:${prefix}\\s+${escapedForm})`);
      }
    }
  }

  return Array.from(fragments);
}

function buildWordForms(word) {
  const forms = new Set();
  const base = word.toLowerCase();
  forms.add(base);
  if (base.endsWith('es')) {
    forms.add(base.slice(0, -2));
  } else if (base.endsWith('s')) {
    forms.add(base.slice(0, -1));
  } else {
    forms.add(`${base}s`);
  }
  return Array.from(forms);
}

function matchesAreEquivalent(a, b) {
  if (!a || !b) {
    return false;
  }
  const sameQuantity = almostEqual(a.quantity, b.quantity);
  const sameUnit = (a.unit || null) === (b.unit || null);
  return sameQuantity && sameUnit;
}

function almostEqual(a, b, epsilon = 0.01) {
  if (a == null || b == null) {
    return false;
  }
  return Math.abs(a - b) <= epsilon;
}

function normalizeQuantity(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Math.round(value * 100) / 100;
}

function normalizeText(text) {
  return typeof text === 'string'
    ? text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

function collapseWhitespace(text) {
  return text ? text.replace(/\s+/g, ' ').trim() : '';
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

import { fetchMealimeRecipePage } from './pageParser.js';
import { normalizeIngredients } from './ingredientNormalizer.js';
import { mergeStepQuantities } from './stepQuantityAugmenter.js';

export async function importMealimeRecipe(idOrUrl, { augmentFromSteps = true } = {}) {
  const rawRecipe = await fetchMealimeRecipePage(idOrUrl);
  const warnings = [...(rawRecipe.warnings || [])];

  const steps = normalizeSteps(rawRecipe.stepTexts);

  const { minutes: timeMinutes, warning: timeWarning } = parseTimeToMinutes(rawRecipe.timeText);
  if (timeWarning) {
    warnings.push(timeWarning);
  }

  const { servings, warning: servingsWarning } = parseServings(rawRecipe.servingsText);
  if (servingsWarning) {
    warnings.push(servingsWarning);
  }

  const { ingredients: normalizedIngredients, warnings: ingredientWarnings } = normalizeIngredients(
    rawRecipe.ingredientTexts || []
  );
  warnings.push(...ingredientWarnings);

  let finalIngredients = normalizedIngredients;
  if (augmentFromSteps) {
    const { ingredients: augmentedIngredients, warnings: augmentationWarnings } = mergeStepQuantities(
      finalIngredients,
      steps
    );
    finalIngredients = augmentedIngredients;
    warnings.push(...augmentationWarnings);
  }

  return {
    sourceUrl: rawRecipe.sourceUrl,
    title: rawRecipe.title || null,
    timeMinutes: timeMinutes != null ? Math.round(timeMinutes * 100) / 100 : null,
    servings: servings != null ? Math.round(servings * 100) / 100 : null,
    ingredients: finalIngredients,
    steps,
    warnings,
  };
}

export function parseTimeToMinutes(timeText) {
  if (!timeText || typeof timeText !== 'string') {
    return { minutes: null };
  }

  const normalized = timeText.toLowerCase();
  const matches = [...normalized.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hour|hrs?|hr|h|minutes?|mins?|min|m)/g)];

  if (matches.length === 0) {
    const fallback = normalized.match(/(\d+(?:\.\d+)?)/);
    if (fallback) {
      return {
        minutes: parseFloat(fallback[1]),
        warning: `Assuming time is in minutes for: "${timeText.trim()}"`,
      };
    }
    return {
      minutes: null,
      warning: `Unable to parse time from "${timeText.trim()}"`,
    };
  }

  let totalMinutes = 0;
  for (const match of matches) {
    const value = parseFloat(match[1]);
    if (!Number.isFinite(value)) {
      continue;
    }

    const unit = match[2];
    if (/^h/.test(unit)) {
      totalMinutes += value * 60;
    } else {
      totalMinutes += value;
    }
  }

  if (totalMinutes === 0) {
    return {
      minutes: null,
      warning: `Unable to parse time from "${timeText.trim()}"`,
    };
  }

  return { minutes: totalMinutes };
}

export function parseServings(servingsText) {
  if (!servingsText || typeof servingsText !== 'string') {
    return { servings: null };
  }

  const normalized = servingsText.toLowerCase();
  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);

  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1]);
    const max = parseFloat(rangeMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      const average = (min + max) / 2;
      return {
        servings: average,
        warning: `Servings range "${servingsText.trim()}" normalized to ${average}.`,
      };
    }
  }

  const singleMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    return { servings: parseFloat(singleMatch[1]) };
  }

  return {
    servings: null,
    warning: `Unable to parse servings from "${servingsText.trim()}"`,
  };
}

function normalizeSteps(stepTexts = []) {
  return stepTexts
    .map((text) => (typeof text === 'string' ? text.trim() : ''))
    .filter((text) => Boolean(text));
}

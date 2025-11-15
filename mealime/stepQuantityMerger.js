const UNICODE_FRACTIONS = {
  "¼": "1/4",
  "½": "1/2",
  "¾": "3/4",
  "⅐": "1/7",
  "⅑": "1/9",
  "⅒": "1/10",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅕": "1/5",
  "⅖": "2/5",
  "⅗": "3/5",
  "⅘": "4/5",
  "⅙": "1/6",
  "⅚": "5/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const UNIT_SYNONYMS = {
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  tbsps: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  tsps: "tsp",
  cup: "cup",
  cups: "cup",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  "fl oz": "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  gram: "g",
  grams: "g",
  g: "g",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  head: "head",
  heads: "head",
  bunch: "bunch",
  bunches: "bunch",
  clove: "clove",
  cloves: "clove",
  pinch: "pinch",
  pinches: "pinch",
  package: "package",
  packages: "package",
  bag: "bag",
  bags: "bag",
  can: "can",
  cans: "can",
  stick: "stick",
  sticks: "stick",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  sprig: "sprig",
  sprigs: "sprig",
};

function normalizeFractionGlyphs(text) {
  return (text || '').replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, match => ` ${UNICODE_FRACTIONS[match]} `);
}

function sanitizeForTokenization(text) {
  return normalizeFractionGlyphs(text)
    .replace(/(\d+)-(\d+\/\d+)/g, '$1 $2')
    .replace(/[(),]/g, ' ')
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isFraction(token) {
  return /^\d+\/\d+$/.test(token);
}

function isNumber(token) {
  return /^\d+(?:\.\d+)?$/.test(token);
}

function fractionToDecimal(token) {
  const [numerator, denominator] = token.split('/').map(Number);
  if (!denominator) return null;
  return numerator / denominator;
}

function parseQuantity(tokens, index) {
  const token = tokens[index];
  if (!token) {
    return null;
  }
  let quantity = null;
  let consumed = 0;
  if (isNumber(token)) {
    quantity = Number(token);
    consumed = 1;
  } else if (isFraction(token)) {
    quantity = fractionToDecimal(token);
    consumed = 1;
  }
  if (quantity === null) {
    return null;
  }
  const nextToken = tokens[index + consumed];
  if (nextToken && isFraction(nextToken)) {
    const extra = fractionToDecimal(nextToken);
    if (extra !== null) {
      quantity += extra;
      consumed += 1;
    }
  }
  return { quantity, consumed };
}

function findUnit(tokens, index) {
  const first = tokens[index];
  if (!first) {
    return { unit: null, consumed: 0 };
  }
  const second = tokens[index + 1];
  if (first && second) {
    const combo = `${first} ${second}`;
    if (UNIT_SYNONYMS[combo]) {
      return { unit: UNIT_SYNONYMS[combo], consumed: 2 };
    }
  }
  if (UNIT_SYNONYMS[first]) {
    return { unit: UNIT_SYNONYMS[first], consumed: 1 };
  }
  return { unit: null, consumed: 0 };
}

function singularize(word) {
  if (!word) return '';
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

function normalizeToken(word) {
  return singularize(word.replace(/[^a-z]/gi, '').toLowerCase());
}

function buildIngredientEntries(ingredients = []) {
  return ingredients.map((ingredient, index) => {
    const name = typeof ingredient?.name === 'string' ? ingredient.name : '';
    const tokens = name
      .toLowerCase()
      .split(/[^a-z]+/)
      .map(normalizeToken)
      .filter(Boolean);
    return {
      key: name.toLowerCase() || `ingredient-${index}`,
      ingredient,
      tokens: new Set(tokens),
      name,
    };
  });
}

function findIngredientMatch(normalizedToken, rawTokens, tokenIndex, entries) {
  if (!normalizedToken) return null;
  const candidates = entries.filter(entry => entry.tokens.has(normalizedToken));
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  const lookahead = rawTokens.slice(tokenIndex, tokenIndex + 2).map(part => part.toLowerCase());
  const lookaheadText = lookahead.join(' ').trim();
  if (lookaheadText) {
    const exact = candidates.find(entry => entry.name.toLowerCase().includes(lookaheadText));
    if (exact) {
      return exact;
    }
  }
  const sorted = [...candidates].sort((a, b) => a.tokens.size - b.tokens.size);
  return sorted[0];
}

function extractMentions(stepText, stepIndex) {
  const sanitized = sanitizeForTokenization(stepText);
  if (!sanitized) {
    return { mentions: [], rawTokens: [] };
  }
  const rawTokens = sanitized.split(/\s+/);
  const tokens = rawTokens.map(token => token.toLowerCase());
  const mentions = [];
  for (let i = 0; i < tokens.length; i++) {
    const quantityResult = parseQuantity(tokens, i);
    if (!quantityResult) continue;
    const unitResult = findUnit(tokens, i + quantityResult.consumed);
    if (!unitResult.unit) continue;
    const targetIndex = i + quantityResult.consumed + unitResult.consumed;
    if (!rawTokens[targetIndex]) continue;
    const normalizedToken = normalizeToken(rawTokens[targetIndex]);
    if (!normalizedToken) continue;
    const displayText = rawTokens.slice(targetIndex, targetIndex + 2).join(' ').trim();
    mentions.push({
      quantity: quantityResult.quantity,
      unit: unitResult.unit,
      tokenIndex: targetIndex,
      originalToken: displayText || rawTokens[targetIndex],
      normalizedToken,
      stepIndex,
    });
    i = targetIndex;
  }
  return { mentions, rawTokens };
}

function formatQuantity(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }
  return Number(value.toFixed(3));
}

function normalizeInstructions(rawSteps = []) {
  return (Array.isArray(rawSteps) ? rawSteps : [])
    .map(step => (typeof step === 'string' ? step.replace(/\r/g, '').replace(/\s+\n/g, '\n').trim() : ''))
    .filter(Boolean);
}

function summarizeTotals(totals, warnings, discrepancies) {
  const stepQuantities = [];
  totals.forEach(entry => {
    const unitTotals = Array.from(entry.unitTotals.entries());
    if (!unitTotals.length) {
      return;
    }
    if (unitTotals.length > 1) {
      warnings.push(
        `Instructions reference ${entry.ingredient.name} using multiple units (${unitTotals
          .map(([unit]) => unit)
          .join(', ')}).`
      );
    }
    const [primaryUnit, primaryQuantity] = unitTotals.sort((a, b) => b[1] - a[1])[0];
    const formattedQuantity = formatQuantity(primaryQuantity);
    stepQuantities.push({
      ingredientName: entry.ingredient.name,
      quantity: formattedQuantity,
      unit: primaryUnit,
      mentions: entry.mentions.slice(),
    });
    if (typeof entry.ingredient.quantity === 'number' && entry.ingredient.unit) {
      if (entry.ingredient.unit !== primaryUnit) {
        const message = `Instructions use ${primaryUnit} for ${entry.ingredient.name} but the ingredient list is in ${entry.ingredient.unit}.`;
        warnings.push(message);
        discrepancies.push({
          ingredientName: entry.ingredient.name,
          listedQuantity: entry.ingredient.quantity,
          listedUnit: entry.ingredient.unit,
          instructionQuantity: formattedQuantity,
          instructionUnit: primaryUnit,
          reason: message,
        });
      } else {
        const difference = Math.abs(entry.ingredient.quantity - primaryQuantity);
        if (difference > 0.01) {
          const message = `Instructions call for ${formatQuantity(primaryQuantity)} ${primaryUnit} ${entry.ingredient.name} but the ingredient list has ${entry.ingredient.quantity} ${entry.ingredient.unit}.`;
          warnings.push(message);
          discrepancies.push({
            ingredientName: entry.ingredient.name,
            listedQuantity: entry.ingredient.quantity,
            listedUnit: entry.ingredient.unit,
            instructionQuantity: formattedQuantity,
            instructionUnit: primaryUnit,
            reason: message,
          });
        }
      }
    }
  });
  stepQuantities.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
  return stepQuantities;
}

export function mergeStepQuantities(rawSteps = [], ingredients = []) {
  const warnings = [];
  const discrepancies = [];
  const cleanedSteps = normalizeInstructions(rawSteps);
  const instructions = cleanedSteps.join('\n\n');
  if (!cleanedSteps.length) {
    return {
      instructions,
      stepQuantities: [],
      discrepancies,
      warnings,
    };
  }
  const ingredientEntries = buildIngredientEntries(ingredients);
  const totals = new Map();

  cleanedSteps.forEach((step, stepIndex) => {
    const { mentions, rawTokens } = extractMentions(step, stepIndex);
    mentions.forEach(mention => {
      const match = findIngredientMatch(mention.normalizedToken, rawTokens, mention.tokenIndex, ingredientEntries);
      if (!match) {
        const message = `Instructions reference ${mention.originalToken} (${formatQuantity(mention.quantity)} ${mention.unit}) but it was not found in the ingredient list.`;
        warnings.push(message);
        discrepancies.push({
          ingredientName: mention.originalToken,
          listedQuantity: null,
          listedUnit: null,
          instructionQuantity: formatQuantity(mention.quantity),
          instructionUnit: mention.unit,
          reason: message,
        });
        return;
      }
      const key = match.key;
      if (!totals.has(key)) {
        totals.set(key, {
          ingredient: match.ingredient,
          unitTotals: new Map(),
          mentions: [],
        });
      }
      const entry = totals.get(key);
      entry.unitTotals.set(mention.unit, (entry.unitTotals.get(mention.unit) || 0) + mention.quantity);
      entry.mentions.push({
        stepIndex: mention.stepIndex,
        quantity: formatQuantity(mention.quantity),
        unit: mention.unit,
      });
    });
  });

  const stepQuantities = summarizeTotals(totals, warnings, discrepancies);

  return {
    instructions,
    stepQuantities,
    discrepancies,
    warnings,
  };
}

export default {
  mergeStepQuantities,
};

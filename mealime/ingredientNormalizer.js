const FRACTION_MAP = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 1 / 10,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

const UNIT_SYNONYMS = {
  tbsp: ['tbsp', 'tbsp.', 'tablespoon', 'tablespoons', 'tbs', 'tb.'],
  tsp: ['tsp', 'tsp.', 'teaspoon', 'teaspoons'],
  cup: ['cup', 'cups', 'c', 'c.'],
  oz: ['oz', 'oz.', 'ounce', 'ounces'],
  lb: ['lb', 'lb.', 'lbs', 'pound', 'pounds'],
  g: ['g', 'gram', 'grams'],
  kg: ['kg', 'kilogram', 'kilograms'],
  ml: ['ml', 'milliliter', 'milliliters'],
  l: ['l', 'liter', 'liters', 'litre', 'litres'],
  head: ['head', 'heads'],
  bunch: ['bunch', 'bunches'],
  clove: ['clove', 'cloves'],
  pinch: ['pinch', 'pinches'],
  can: ['can', 'cans'],
  piece: ['piece', 'pieces'],
  stick: ['stick', 'sticks'],
};

const SYNONYM_MATCHERS = buildSynonymMatchers();

export function normalizeIngredients(rawIngredientTexts = []) {
  const ingredients = [];
  const warnings = [];

  for (const rawText of rawIngredientTexts) {
    if (!rawText || !rawText.trim()) {
      continue;
    }

    const parsed = parseIngredient(rawText.trim());
    ingredients.push(parsed);

    if (parsed.quantity == null) {
      warnings.push(`Missing quantity for ingredient: "${parsed.originalText}"`);
    }
    if (!parsed.name) {
      warnings.push(`Missing ingredient name for: "${parsed.originalText}"`);
    }
  }

  return { ingredients, warnings };
}

function parseIngredient(text) {
  const originalText = text;
  const collapsed = collapseWhitespace(replaceUnicodeFractions(text));

  const { notes, textWithoutNotes } = extractParentheticalNotes(collapsed);
  let working = textWithoutNotes.trim();

  const { quantity, quantityText, remainingAfterQuantity } = extractQuantity(working);
  working = remainingAfterQuantity.trim();

  const { unit, matchedLength } = detectUnit(working);
  if (matchedLength) {
    working = working.slice(matchedLength).trim();
  }

  working = working.replace(/^of\s+/i, '').trim();
  const name = working || null;

  const normalizedQuantity = typeof quantity === 'number' && !Number.isNaN(quantity)
    ? Math.round(quantity * 100) / 100
    : null;

  return {
    originalText,
    name,
    quantity: typeof quantity === 'number' && !Number.isNaN(quantity) ? quantity : null,
    unit,
    normalizedQuantity,
    normalizedUnit: unit || null,
    notes: notes.length ? notes.join('; ') : null,
    quantityText,
  };
}

function replaceUnicodeFractions(text) {
  return text.replace(/[\u00BC-\u00BE\u2150-\u215E]/g, (char) => {
    const decimal = FRACTION_MAP[char];
    if (decimal == null) {
      return char;
    }
    return ` ${decimal}`;
  });
}

function extractParentheticalNotes(text) {
  const notes = [];
  const stripped = text.replace(/\(([^)]+)\)/g, (_, note) => {
    if (note && note.trim()) {
      notes.push(note.trim());
    }
    return ' ';
  });
  return { notes, textWithoutNotes: stripped };
}

function extractQuantity(text) {
  let remaining = text;
  let quantity = null;
  let quantityText = null;

  const stackedMatch = remaining.match(/^(\d+\s+\d+\/\d+)/);
  if (stackedMatch) {
    quantityText = stackedMatch[1];
    quantity = parseStackedFraction(quantityText);
    remaining = remaining.slice(stackedMatch[0].length);
    return { quantity, quantityText, remainingAfterQuantity: remaining };
  }

  const fractionMatch = remaining.match(/^(\d+\/\d+)/);
  if (fractionMatch) {
    quantityText = fractionMatch[1];
    quantity = parseFraction(quantityText);
    remaining = remaining.slice(fractionMatch[0].length);
    return { quantity, quantityText, remainingAfterQuantity: remaining };
  }

  const decimalMatch = remaining.match(/^(\d+(?:\.\d+)?)/);
  if (decimalMatch) {
    quantityText = decimalMatch[1];
    quantity = parseFloat(quantityText);
    remaining = remaining.slice(decimalMatch[0].length);
    return { quantity, quantityText, remainingAfterQuantity: remaining };
  }

  return { quantity: null, quantityText: null, remainingAfterQuantity: remaining };
}

function parseStackedFraction(text) {
  const [whole, fractionPart] = text.trim().split(/\s+/);
  const wholeNumber = parseInt(whole, 10);
  return wholeNumber + parseFraction(fractionPart);
}

function parseFraction(text) {
  const [numerator, denominator] = text.split('/').map((part) => parseFloat(part));
  if (!denominator) {
    return Number.isFinite(numerator) ? numerator : NaN;
  }
  return numerator / denominator;
}

function detectUnit(text) {
  const lower = text.toLowerCase();
  for (const matcher of SYNONYM_MATCHERS) {
    const { regex, canonical } = matcher;
    const match = lower.match(regex);
    if (match) {
      return { unit: canonical, matchedLength: match[0].length };
    }
  }
  return { unit: null, matchedLength: 0 };
}

function buildSynonymMatchers() {
  const entries = [];
  for (const [canonical, synonyms] of Object.entries(UNIT_SYNONYMS)) {
    const escaped = synonyms.map((syn) => escapeRegExp(syn.toLowerCase()))
      .sort((a, b) => b.length - a.length);
    const regex = new RegExp(`^(${escaped.join('|')})(?:\\b|\n|\s|$)`);
    entries.push({ canonical, regex });
  }
  return entries;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export { extractQuantity, detectUnit, replaceUnicodeFractions };

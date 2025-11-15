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
  pkg: "package",
  pkgs: "package",
  stick: "stick",
  sticks: "stick",
  slice: "slice",
  slices: "slice",
  piece: "piece",
  pieces: "piece",
  sprig: "sprig",
  sprigs: "sprig",
  bunch: "bunch",
  bunches: "bunch",
  head: "head",
  heads: "head",
  log: "log",
  logs: "log",
  small: "each",
  smaller: "each",
  medium: "each",
  large: "each",
  larger: "each",
  extralarge: "each",
  "extra large": "each",
};

const UNIT_DESCRIPTORS = {
  small: "small",
  smaller: "small",
  medium: "medium",
  large: "large",
  larger: "large",
  extralarge: "extra-large",
  "extra large": "extra-large",
};

const FALLBACK_INGREDIENT_NAME = "Unnamed ingredient";

function normalizeFractionGlyphs(text) {
  return text.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, match => ` ${UNICODE_FRACTIONS[match]} `);
}

function cleanToken(token) {
  return token.replace(/[^a-z]/gi, "").toLowerCase();
}

function fractionToDecimal(fraction) {
  const [numerator, denominator] = fraction.split("/").map(Number);
  if (!denominator) return null;
  return numerator / denominator;
}

function isFraction(token) {
  return /^\d+\/\d+$/.test(token);
}

function isNumber(token) {
  return /^\d+(?:\.\d+)?$/.test(token);
}

function parseQuantityTokens(tokens) {
  let quantity = null;
  let consumed = 0;
  if (!tokens.length) {
    return { quantity, consumed };
  }
  if (isNumber(tokens[0])) {
    quantity = Number(tokens[0]);
    consumed = 1;
  } else if (isFraction(tokens[0])) {
    quantity = fractionToDecimal(tokens[0]);
    consumed = 1;
  }
  if (consumed && tokens[consumed] && isFraction(tokens[consumed])) {
    quantity += fractionToDecimal(tokens[consumed]);
    consumed += 1;
  }
  return { quantity, consumed };
}

function findUnit(tokens) {
  if (!tokens.length) {
    return { unit: null, consumed: 0, descriptor: null };
  }
  const first = cleanToken(tokens[0]);
  const second = tokens[1] ? cleanToken(tokens[1]) : "";
  const combos = [];
  if (first && second) {
    combos.push(`${first} ${second}`);
  }
  if (first) {
    combos.push(first);
  }
  for (const combo of combos) {
    if (UNIT_SYNONYMS[combo]) {
      const consumed = combo.includes(" ") ? 2 : 1;
      return {
        unit: UNIT_SYNONYMS[combo],
        consumed,
        descriptor: UNIT_DESCRIPTORS[combo] || null,
      };
    }
  }
  return { unit: null, consumed: 0, descriptor: null };
}

function extractSizeDescriptor(tokens) {
  if (!tokens.length) {
    return { descriptor: null, consumed: 0 };
  }
  const first = cleanToken(tokens[0]);
  const second = tokens[1] ? cleanToken(tokens[1]) : "";
  const combos = [];
  if (first && second) {
    combos.push({ key: `${first} ${second}`, consumed: 2 });
  }
  if (first) {
    combos.push({ key: first, consumed: 1 });
  }
  for (const combo of combos) {
    if (UNIT_DESCRIPTORS[combo.key]) {
      return { descriptor: UNIT_DESCRIPTORS[combo.key], consumed: combo.consumed };
    }
  }
  return { descriptor: null, consumed: 0 };
}

function extractParentheticalSegments(text) {
  const segments = [];
  const without = text.replace(/\(([^)]*)\)/g, (_, inner) => {
    const trimmed = inner.trim();
    if (trimmed) {
      segments.push(trimmed);
    }
    return " ";
  });
  return { textWithoutParentheses: without, segments };
}

function parseParentheticalSize(segments) {
  for (const segment of segments) {
    const normalized = normalizeFractionGlyphs(segment)
      .replace(/(\d+)-(\d+\/\d+)/g, "$1 $2")
      .replace(/[^\d\sa-z\/\.]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      continue;
    }
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const quantityResult = parseQuantityTokens(tokens);
    if (quantityResult.quantity === null) {
      continue;
    }
    const remainingTokens = tokens.slice(quantityResult.consumed);
    const unitResult = findUnit(remainingTokens);
    if (!unitResult.unit) {
      continue;
    }
    return {
      amount: Number(quantityResult.quantity.toFixed(3)),
      unit: unitResult.unit,
      text: segment.trim(),
    };
  }
  return null;
}

export function normalizeIngredient(text, warnings = []) {
  if (typeof text !== "string") {
    return null;
  }
  const originalText = text.trim();
  let working = normalizeFractionGlyphs(originalText)
    .replace(/(\d+)-(\d+\/\d+)/g, "$1 $2");
  const { textWithoutParentheses, segments } = extractParentheticalSegments(working);
  const sanitized = textWithoutParentheses
    .replace(/\s+/g, " ")
    .trim();
  const tokens = sanitized.split(/\s+/).filter(Boolean);
  const quantityResult = parseQuantityTokens(tokens);
  const remainingTokens = tokens.slice(quantityResult.consumed);
  const descriptorResult = extractSizeDescriptor(remainingTokens);
  const tokensAfterDescriptor = remainingTokens.slice(descriptorResult.consumed);
  const unitResult = findUnit(tokensAfterDescriptor);
  const nameTokens = tokensAfterDescriptor.slice(unitResult.consumed);
  const tokensFullyConsumed = quantityResult.consumed >= tokens.length;
  const hasNameTokens = nameTokens.length > 0;
  const sizeInfo = parseParentheticalSize(segments);
  let quantity = quantityResult.quantity !== null ? Number(quantityResult.quantity.toFixed(3)) : null;
  let unit = unitResult.unit;
  const sizeDescriptor = descriptorResult.descriptor || unitResult.descriptor || null;
  let inferredEachFromQuantity = false;
  if (quantity === null && sizeInfo) {
    quantity = sizeInfo.amount;
    unit = unit || sizeInfo.unit;
  } else if (!unit && sizeInfo) {
    unit = sizeInfo.unit;
  }
  if (!unit && sizeDescriptor) {
    unit = "each";
  }
  if (!unit && quantity !== null && (hasNameTokens || tokensFullyConsumed)) {
    unit = "each";
    inferredEachFromQuantity = true;
  }
  const ingredientName = nameTokens.join(" ").trim();
  const resolvedName = ingredientName || FALLBACK_INGREDIENT_NAME;
  const ingredient = {
    originalText,
    quantity,
    unit,
    name: resolvedName,
    sizeAmount: sizeInfo ? sizeInfo.amount : null,
    sizeUnit: sizeInfo ? sizeInfo.unit : null,
    sizeDescriptor,
  };
  if (ingredient.quantity === null) {
    warnings.push({ ingredient: originalText, reason: "quantity" });
  }
  if (!ingredient.unit && !ingredient.sizeDescriptor && !inferredEachFromQuantity) {
    warnings.push({ ingredient: originalText, reason: "unit" });
  }
  return ingredient;
}

export function normalizeIngredientList(rawIngredients = []) {
  const warnings = [];
  const ingredients = rawIngredients
    .map(text => normalizeIngredient(text, warnings))
    .filter(Boolean);
  return { ingredients, warnings };
}

export default {
  normalizeIngredient,
  normalizeIngredientList,
};

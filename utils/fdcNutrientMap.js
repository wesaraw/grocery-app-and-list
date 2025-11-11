const MASS_FACTORS_TO_GRAMS = {
  g: 1,
  gram: 1,
  grams: 1,
  mg: 1 / 1000,
  milligram: 1 / 1000,
  milligrams: 1 / 1000,
  ug: 1 / 1000000,
  mcg: 1 / 1000000,
  'µg': 1 / 1000000,
  microgram: 1 / 1000000,
  micrograms: 1 / 1000000,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000
};

const ENERGY_FACTORS_TO_KCAL = {
  kcal: 1,
  kilocalories: 1,
  kj: 0.239005736,
  kilojoules: 0.239005736
};

function normalizeUnit(unit) {
  if (!unit) return '';
  return String(unit)
    .trim()
    .toLowerCase()
    .replace(/[^a-zµ]/g, '');
}

function convertMassToGrams(amount, unit) {
  if (amount == null) return null;
  const normalized = normalizeUnit(unit);
  const factor = MASS_FACTORS_TO_GRAMS[normalized];
  if (factor == null) return null;
  return amount * factor;
}

function convertEnergyToKcal(amount, unit) {
  if (amount == null) return null;
  const normalized = normalizeUnit(unit);
  const factor = ENERGY_FACTORS_TO_KCAL[normalized];
  if (factor == null) return null;
  return amount * factor;
}

export const NUTRIENT_DEFINITIONS = [
  { key: 'energy', label: 'Energy', nutrientIds: [1008], nutrientNumbers: ['208'], fallbackNames: ['energy'], targetUnit: 'kcal', displayUnit: 'kcal', decimals: 2 },
  { key: 'water', label: 'Water', nutrientIds: [1051], nutrientNumbers: ['255'], fallbackNames: ['water'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'carbohydrates', label: 'Carbohydrates', nutrientIds: [1005], nutrientNumbers: ['205'], fallbackNames: ['carbohydrate'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'fiber', label: 'Fiber', nutrientIds: [1079], nutrientNumbers: ['291'], fallbackNames: ['fiber', 'fibers'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'starch', label: 'Starch', nutrientIds: [1118], nutrientNumbers: ['209'], fallbackNames: ['starch'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'sugars', label: 'Sugars', nutrientIds: [2000, 193, 269], nutrientNumbers: ['269'], fallbackNames: ['sugar'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  {
    key: 'net_carbs',
    label: 'Net Carbs',
    targetUnit: 'g',
    displayUnit: 'g',
    decimals: 2,
    derived: base => {
      const carb = base.carbohydrates?.amountPer100g ?? null;
      const fiber = base.fiber?.amountPer100g ?? 0;
      if (carb == null) return null;
      return Math.max(0, carb - fiber);
    }
  },
  { key: 'fat', label: 'Fat', nutrientIds: [1004], nutrientNumbers: ['204'], fallbackNames: ['total lipid'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'monounsaturated_fat', label: 'Monounsaturated Fat', nutrientIds: [1292], nutrientNumbers: ['645'], fallbackNames: ['monounsaturated'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'polyunsaturated_fat', label: 'Polyunsaturated Fat', nutrientIds: [1293], nutrientNumbers: ['646'], fallbackNames: ['polyunsaturated'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'omega3', label: 'Omega-3', nutrientIds: [8510], nutrientNumbers: ['8510'], fallbackNames: ['omega-3', 'n-3'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'omega6', label: 'Omega-6', nutrientIds: [8511], nutrientNumbers: ['8511'], fallbackNames: ['omega-6', 'n-6'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'saturated_fat', label: 'Saturated Fat', nutrientIds: [1258], nutrientNumbers: ['606'], fallbackNames: ['saturated'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'trans_fat', label: 'Trans-Fats', nutrientIds: [1257], nutrientNumbers: ['605'], fallbackNames: ['trans'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'cholesterol', label: 'Cholesterol', nutrientIds: [1253], nutrientNumbers: ['601'], fallbackNames: ['cholesterol'], targetUnit: 'g', displayUnit: 'mg', decimals: 1 },
  { key: 'protein', label: 'Protein', nutrientIds: [1003], nutrientNumbers: ['203'], fallbackNames: ['protein'], targetUnit: 'g', displayUnit: 'g', decimals: 2 },
  { key: 'vitamin_b1', label: 'Vitamin B1 (Thiamine)', nutrientIds: [1165], nutrientNumbers: ['404'], fallbackNames: ['thiamin'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'vitamin_b2', label: 'Vitamin B2 (Riboflavin)', nutrientIds: [1166], nutrientNumbers: ['405'], fallbackNames: ['riboflavin'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'vitamin_b3', label: 'Vitamin B3 (Niacin)', nutrientIds: [1167], nutrientNumbers: ['406'], fallbackNames: ['niacin'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'vitamin_b5', label: 'Vitamin B5 (Pantothenic Acid)', nutrientIds: [1170], nutrientNumbers: ['410'], fallbackNames: ['pantothenic'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'vitamin_b6', label: 'Vitamin B6 (Pyridoxine)', nutrientIds: [1175], nutrientNumbers: ['415'], fallbackNames: ['vitamin b-6', 'pyridoxine'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'vitamin_b12', label: 'Vitamin B12 (Cobalamin)', nutrientIds: [1178], nutrientNumbers: ['418'], fallbackNames: ['vitamin b-12', 'cobalamin'], targetUnit: 'g', displayUnit: 'mcg', decimals: 2 },
  { key: 'biotin', label: 'Biotin', nutrientIds: [1177], nutrientNumbers: ['416'], fallbackNames: ['biotin'], targetUnit: 'g', displayUnit: 'mcg', decimals: 2 },
  { key: 'choline', label: 'Choline', nutrientIds: [1180], nutrientNumbers: ['421'], fallbackNames: ['choline'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'folate', label: 'Folate', nutrientIds: [1186], nutrientNumbers: ['435', '417'], fallbackNames: ['folate'], targetUnit: 'g', displayUnit: 'mcg', decimals: 2 },
  { key: 'vitamin_a', label: 'Vitamin A', nutrientIds: [1106], nutrientNumbers: ['320', '318'], fallbackNames: ['vitamin a'], targetUnit: 'g', displayUnit: 'mcg', decimals: 2 },
  { key: 'vitamin_c', label: 'Vitamin C', nutrientIds: [1162], nutrientNumbers: ['401'], fallbackNames: ['vitamin c'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'vitamin_d', label: 'Vitamin D', nutrientIds: [1114], nutrientNumbers: ['324'], fallbackNames: ['vitamin d'], targetUnit: 'g', displayUnit: 'mcg', decimals: 2 },
  { key: 'vitamin_e', label: 'Vitamin E', nutrientIds: [1109], nutrientNumbers: ['323'], fallbackNames: ['vitamin e'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'vitamin_k', label: 'Vitamin K', nutrientIds: [1185], nutrientNumbers: ['430'], fallbackNames: ['vitamin k'], targetUnit: 'g', displayUnit: 'mcg', decimals: 2 },
  { key: 'calcium', label: 'Calcium', nutrientIds: [1087], nutrientNumbers: ['301'], fallbackNames: ['calcium'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'copper', label: 'Copper', nutrientIds: [1098], nutrientNumbers: ['312'], fallbackNames: ['copper'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'iodine', label: 'Iodine', nutrientIds: [1100], nutrientNumbers: ['330'], fallbackNames: ['iodine'], targetUnit: 'g', displayUnit: 'mcg', decimals: 2 },
  { key: 'iron', label: 'Iron', nutrientIds: [1089], nutrientNumbers: ['303'], fallbackNames: ['iron'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'magnesium', label: 'Magnesium', nutrientIds: [1090], nutrientNumbers: ['304'], fallbackNames: ['magnesium'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'manganese', label: 'Manganese', nutrientIds: [1092, 1101], nutrientNumbers: ['315'], fallbackNames: ['manganese'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'phosphorus', label: 'Phosphorus', nutrientIds: [1091], nutrientNumbers: ['305'], fallbackNames: ['phosphorus'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'potassium', label: 'Potassium', nutrientIds: [1092, 1096], nutrientNumbers: ['306'], fallbackNames: ['potassium'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'selenium', label: 'Selenium', nutrientIds: [1103], nutrientNumbers: ['317'], fallbackNames: ['selenium'], targetUnit: 'g', displayUnit: 'mcg', decimals: 2 },
  { key: 'sodium', label: 'Sodium', nutrientIds: [1093], nutrientNumbers: ['307'], fallbackNames: ['sodium'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 },
  { key: 'zinc', label: 'Zinc', nutrientIds: [1095], nutrientNumbers: ['309'], fallbackNames: ['zinc'], targetUnit: 'g', displayUnit: 'mg', decimals: 2 }
];

function unwrapNutrient(entry) {
  if (!entry) return null;
  const nutrient = entry.nutrient || entry;
  const id = nutrient.id ?? entry.nutrientId ?? entry.id ?? null;
  const number = nutrient.number ?? entry.number ?? null;
  const name = (nutrient.name || entry.name || '').toLowerCase();
  const unitName = nutrient.unitName || entry.unitName || entry.unit || '';
  const amount =
    entry.amount != null
      ? entry.amount
      : entry.value != null
      ? entry.value
      : nutrient.amount != null
      ? nutrient.amount
      : null;
  return { id, number: number != null ? String(number) : null, name, unitName, amount };
}

function findMatchingNutrient(entries, definition) {
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const info = unwrapNutrient(entry);
    if (!info) continue;
    if (
      (definition.nutrientIds || []).some(id => id === info.id) ||
      (definition.nutrientNumbers || []).some(num => num === info.number) ||
      (definition.fallbackNames || []).some(name => info.name.includes(name))
    ) {
      return { entry, info };
    }
  }
  return null;
}

function convertAmount(info, definition) {
  if (!info || info.amount == null) return null;
  if (definition.targetUnit === 'kcal') {
    return convertEnergyToKcal(info.amount, info.unitName ?? 'kcal');
  }
  const grams = convertMassToGrams(info.amount, info.unitName ?? 'g');
  if (grams == null) return null;
  return grams;
}

function convertToDisplayUnit(valueInTarget, definition) {
  if (valueInTarget == null) return null;
  const target = definition.targetUnit;
  const display = definition.displayUnit || target;
  if (target === 'kcal') {
    if (display === 'kcal') return valueInTarget;
    if (display === 'kj') return valueInTarget / ENERGY_FACTORS_TO_KCAL.kj;
    return valueInTarget;
  }
  if (display === target) return valueInTarget;
  const normalizedDisplay = normalizeUnit(display);
  if (normalizedDisplay === 'mg') return valueInTarget * 1000;
  if (normalizedDisplay === 'mcg' || normalizedDisplay === 'ug' || normalizedDisplay === 'µg') {
    return valueInTarget * 1000000;
  }
  if (normalizedDisplay === 'kg') return valueInTarget / 1000;
  return valueInTarget;
}

function buildBaseMap(nutrientEntries) {
  const map = {};
  const entries = Array.isArray(nutrientEntries) ? nutrientEntries : [];
  const directDefs = NUTRIENT_DEFINITIONS.filter(def => typeof def.derived !== 'function');
  directDefs.forEach(def => {
    const match = findMatchingNutrient(entries, def);
    if (!match) return;
    const amount = convertAmount(match.info, def);
    if (amount == null) return;
    map[def.key] = {
      definition: def,
      amountPer100g: amount
    };
  });
  const derivedDefs = NUTRIENT_DEFINITIONS.filter(def => typeof def.derived === 'function');
  derivedDefs.forEach(def => {
    const derivedAmount = def.derived(map);
    if (derivedAmount == null) return;
    map[def.key] = {
      definition: def,
      amountPer100g: derivedAmount
    };
  });
  return map;
}

export function mapNutrientsFromDetails(details) {
  if (!details) return { perGramVector: {}, nutrients: [] };
  let entries = [];
  if (Array.isArray(details.foodNutrients)) {
    entries = details.foodNutrients;
  } else if (details.labelNutrients) {
    entries = Object.entries(details.labelNutrients).map(([key, value]) => ({
      name: key,
      amount: value?.value ?? value,
      unitName: value?.unitName || value?.unit || 'g'
    }));
  }
  const base = buildBaseMap(entries);
  const perGramVector = {};
  const nutrients = [];
  NUTRIENT_DEFINITIONS.forEach(def => {
    const data = base[def.key];
    if (!data) return;
    const per100g = data.amountPer100g;
    const perGram = per100g / 100;
    perGramVector[def.key] = perGram;
    nutrients.push({
      key: def.key,
      label: def.label,
      unit: def.targetUnit,
      per100g,
      perGram,
      displayUnit: def.displayUnit || def.targetUnit,
      displayPer100g: convertToDisplayUnit(per100g, def),
      displayPerGram: convertToDisplayUnit(perGram, def),
      decimals: def.decimals ?? 2
    });
  });
  return { perGramVector, nutrients };
}

export function formatDisplayValue(value, unit, decimals = 2) {
  if (value == null) return '—';
  const fixed = Number(value).toFixed(decimals);
  return `${fixed} ${unit}`.trim();
}

export function gramsForUnit(unit) {
  if (!unit) return null;
  const normalized = normalizeUnit(unit);
  if (normalized === 'g' || normalized === 'gram' || normalized === 'grams') return 1;
  if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms') return 1000;
  if (normalized === 'mg' || normalized === 'milligram' || normalized === 'milligrams') return 1 / 1000;
  if (normalized === 'mcg' || normalized === 'ug' || normalized === 'µg' || normalized === 'microgram' || normalized === 'micrograms') {
    return 1 / 1000000;
  }
  if (normalized === 'oz' || normalized === 'ounce' || normalized === 'ounces') return 28.349523125;
  if (normalized === 'lb' || normalized === 'pound' || normalized === 'pounds') return 453.59237;
  if (normalized === 'fl' || normalized === 'floz' || normalized === 'fluidounce') return null;
  return null;
}

export function computeQuantityFromPerGram(perGramVector, grams) {
  if (!perGramVector || grams == null) return {};
  const result = {};
  Object.entries(perGramVector).forEach(([key, value]) => {
    result[key] = value * grams;
  });
  return result;
}

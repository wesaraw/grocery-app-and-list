import { getFdcApiKey } from './apiKeyStorage.js';
import { canonicalName } from './nameUtils.js';
import { saveIngredient, getIngredientByItemName } from './ingredientStorage.js';
import { mapNutrientsFromDetails } from './fdcNutrientMap.js';

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const DETAILS_URL = id => `https://api.nal.usda.gov/fdc/v1/food/${id}`;

const DATA_TYPE_WEIGHTS = {
  Foundation: 0.25,
  'SR Legacy': 0.18,
  'Survey (FNDDS)': 0.12,
  FNDDS: 0.12,
  Branded: 0.04,
  Experimental: 0.02
};

const FORM_MATCH_BONUS = 0.08;
const PORTION_BONUS = 0.05;
const DEFAULT_THRESHOLD = 0.62;
const STALE_MS = 1000 * 60 * 60 * 24 * 30;
const MAX_PAGE_SIZE = 25;
const FORM_KEYWORDS = ['raw', 'cooked', 'boiled', 'skinless', 'drained', 'dried', 'frozen', 'fresh'];

class MissingFdcApiKeyError extends Error {
  constructor() {
    super('FDC API key is missing');
    this.name = 'MissingFdcApiKeyError';
    this.code = 'MISSING_FDC_API_KEY';
  }
}

function clamp(value, min = 0, max = 1) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function tokenize(text) {
  if (!text) return [];
  return Array.from(
    new Set(
      String(text)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    )
  );
}

function jaroDistance(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const maxDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const matches = [];
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches.push({ i, j });
      break;
    }
  }

  const matchesCount = matches.length;
  if (!matchesCount) return 0;

  const s1Chars = [];
  const s2Chars = [];
  matches.forEach(({ i, j }) => {
    s1Chars.push(s1[i]);
    s2Chars.push(s2[j]);
  });

  let transpositions = 0;
  for (let i = 0; i < s1Chars.length; i++) {
    if (s1Chars[i] !== s2Chars[i]) transpositions++;
  }
  transpositions /= 2;

  return (
    (matchesCount / s1.length + matchesCount / s2.length + (matchesCount - transpositions) / matchesCount) /
    3
  );
}

function jaroWinkler(a, b, prefixScale = 0.1, maxPrefix = 4) {
  const jd = jaroDistance(a, b);
  if (jd < 0.7) return jd;
  let prefix = 0;
  for (let i = 0; i < Math.min(maxPrefix, a.length, b.length); i++) {
    if (a[i].toLowerCase() === b[i].toLowerCase()) prefix++;
    else break;
  }
  return jd + prefix * prefixScale * (1 - jd);
}

function computeTokenSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setB = new Set(tokensB);
  let intersection = 0;
  tokensA.forEach(token => {
    if (setB.has(token)) intersection++;
  });
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

function hasHouseholdPortions(candidate) {
  if (!candidate) return false;
  if (candidate.householdServingFullText) return true;
  if (candidate.servingSizeUnit && candidate.servingSize) return true;
  if (Array.isArray(candidate.foodPortions)) {
    return candidate.foodPortions.some(portion => !!portion?.portionDescription || !!portion?.modifier);
  }
  return false;
}

function countFormMatches(itemTokens, candidateTokens) {
  if (!itemTokens.length || !candidateTokens.length) return 0;
  const candidateSet = new Set(candidateTokens);
  return FORM_KEYWORDS.reduce((count, token) => {
    if (itemTokens.includes(token) && candidateSet.has(token)) return count + 1;
    return count;
  }, 0);
}

function getCandidateText(candidate) {
  const parts = [candidate.description, candidate.brandOwner, candidate.additionalDescriptions];
  if (Array.isArray(candidate.ingredients)) {
    parts.push(candidate.ingredients.join(' '));
  } else if (candidate.ingredients) {
    parts.push(candidate.ingredients);
  }
  return parts.filter(Boolean).join(' ');
}

function scoreCandidate(displayName, candidate) {
  const nameTokens = tokenize(displayName);
  const candidateText = getCandidateText(candidate);
  const candidateTokens = tokenize(candidateText);
  const similarity = computeTokenSimilarity(nameTokens, candidateTokens);
  const jwScore = jaroWinkler(displayName, candidate.description || candidateText || '');
  const baseScore = similarity * 0.6 + jwScore * 0.4;
  const weight = DATA_TYPE_WEIGHTS[candidate.dataType] || 0;
  const formMatches = countFormMatches(nameTokens, candidateTokens);
  const formBonus = formMatches > 0 ? FORM_MATCH_BONUS : 0;
  const portionBonus = hasHouseholdPortions(candidate) ? PORTION_BONUS : 0;
  const score = clamp(baseScore + weight + formBonus + portionBonus);
  return score;
}

function sanitizeCandidate(candidate, score) {
  return {
    fdcId: candidate.fdcId,
    description: candidate.description,
    dataType: candidate.dataType,
    brandOwner: candidate.brandOwner || '',
    foodCategory: candidate.foodCategory || '',
    ingredients: candidate.ingredients || '',
    householdServingFullText: candidate.householdServingFullText || '',
    servingSize: candidate.servingSize || null,
    servingSizeUnit: candidate.servingSizeUnit || '',
    score,
    hasPortions: hasHouseholdPortions(candidate)
  };
}

export function rankCandidates(displayName, candidates = []) {
  if (!displayName || !Array.isArray(candidates)) return [];
  const scored = candidates.map(candidate => {
    const score = scoreCandidate(displayName, candidate);
    return {
      ...sanitizeCandidate(candidate, score),
      _original: candidate
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    throw new MissingFdcApiKeyError();
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`FDC request failed: ${res.status} ${res.statusText}`);
    err.responseText = text;
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function searchFdcFoods(query, options = {}) {
  const apiKey = await getFdcApiKey();
  if (!apiKey) throw new MissingFdcApiKeyError();
  const body = {
    query,
    pageSize: Math.min(options.pageSize || 10, MAX_PAGE_SIZE),
    requireAllWords: false,
    includeDataTypes: options.includeDataTypes || ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']
  };
  const response = await fetchJson(`${SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return response.foods || [];
}

export async function fetchFoodDetails(fdcId) {
  if (!fdcId) throw new Error('fdcId is required');
  const apiKey = await getFdcApiKey();
  if (!apiKey) throw new MissingFdcApiKeyError();
  return await fetchJson(`${DETAILS_URL(fdcId)}?api_key=${encodeURIComponent(apiKey)}`);
}

function extractPortions(details) {
  const portions = [];
  if (Array.isArray(details?.foodPortions)) {
    details.foodPortions.forEach(portion => {
      if (!portion) return;
      portions.push({
        id: portion.id || null,
        amount: portion.amount ?? null,
        measureUnit: portion.measureUnit?.abbreviation || portion.measureUnit?.name || '',
        modifier: portion.modifier || portion.portionDescription || '',
        gramWeight: portion.gramWeight ?? null
      });
    });
  }
  if (details?.householdServingFullText || details?.servingSize) {
    portions.push({
      id: 'default',
      amount: details.servingSize ?? 1,
      measureUnit: details.servingSizeUnit || '',
      modifier: details.householdServingFullText || '',
      gramWeight: details.servingSizeInGrams ?? null
    });
  }
  return portions;
}

export function isIngredientRecordStale(record, maxAgeMs = STALE_MS) {
  if (!record) return true;
  if (!maxAgeMs) return false;
  const ts = record.last_checked_at ? Date.parse(record.last_checked_at) : 0;
  if (!ts) return true;
  return Date.now() - ts > maxAgeMs;
}

async function persistIngredient(itemName, unitDefault, candidate, details, confidence) {
  const nutrientData = mapNutrientsFromDetails(details);
  const record = await saveIngredient({
    display_name: itemName,
    normalized_name: canonicalName(itemName),
    unit_default: unitDefault || 'g',
    fdc_id: details.fdcId || candidate.fdcId,
    fdc_data_type: details.dataType || candidate.dataType || null,
    fdc_description: details.description || candidate.description || '',
    confidence: confidence ?? candidate.score ?? null,
    last_checked_at: new Date().toISOString(),
    perGramVector: nutrientData.perGramVector,
    nutrients: nutrientData.nutrients,
    portions: extractPortions(details),
    metadata: {
      searchQuery: itemName,
      brandOwner: details.brandOwner || candidate.brandOwner || '',
      foodCategory: details.foodCategory || candidate.foodCategory || ''
    }
  });
  return record;
}

export async function persistIngredientSelection(itemName, candidate, options = {}) {
  if (!candidate?.fdcId) throw new Error('Candidate selection requires an fdcId');
  const details = await fetchFoodDetails(candidate.fdcId);
  return await persistIngredient(
    itemName,
    options.unitDefault || candidate.unitDefault || options.unit || 'g',
    candidate,
    details,
    options.confidence ?? candidate.score ?? null
  );
}

export async function ensureIngredientRecordForItem(item, options = {}) {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxAgeMs = options.maxAgeMs ?? STALE_MS;
  if (!item || !item.name) {
    return { status: 'invalid', reason: 'missing-name' };
  }
  const unitDefault = item.unit_default || item.home_unit || item.unit || options.unitDefault || 'g';
  const existing = await getIngredientByItemName(item.name);
  if (existing && !options.force && !isIngredientRecordStale(existing, maxAgeMs)) {
    return { status: 'exists', record: existing };
  }
  let foods;
  try {
    foods = await searchFdcFoods(item.name, options.searchOptions || {});
  } catch (err) {
    if (err instanceof MissingFdcApiKeyError || err.code === 'MISSING_FDC_API_KEY') {
      return { status: 'missing-api-key', error: err };
    }
    return { status: 'error', error: err };
  }
  const ranked = rankCandidates(item.name, foods);
  if (!ranked.length) {
    return { status: 'no-results', candidates: [] };
  }
  const best = ranked[0];
  if (best.score < threshold) {
    return {
      status: 'needs-confirmation',
      itemName: item.name,
      candidates: ranked.slice(0, options.maxCandidates ?? 3).map(c => { const { _original, ...rest } = c; return rest; }),
      threshold
    };
  }
  try {
    const record = await persistIngredientSelection(item.name, best, {
      unitDefault,
      confidence: best.score
    });
    return { status: existing ? 'updated' : 'matched', record, candidate: (() => { const { _original, ...rest } = best; return rest; })() };
  } catch (err) {
    if (err instanceof MissingFdcApiKeyError || err.code === 'MISSING_FDC_API_KEY') {
      return { status: 'missing-api-key', error: err };
    }
    return { status: 'error', error: err };
  }
}

export async function refreshIngredientDetails(fdcId, context = {}) {
  try {
    const details = await fetchFoodDetails(fdcId);
    const nutrientData = mapNutrientsFromDetails(details);
    if (context.itemName) {
      await persistIngredient(context.itemName, context.unitDefault || 'g', { fdcId }, details, context.confidence ?? null);
    }
    return {
      details,
      perGramVector: nutrientData.perGramVector,
      nutrients: nutrientData.nutrients,
      portions: extractPortions(details)
    };
  } catch (err) {
    if (err instanceof MissingFdcApiKeyError || err.code === 'MISSING_FDC_API_KEY') {
      return { error: err, status: 'missing-api-key' };
    }
    return { error: err, status: 'error' };
  }
}

export const DEFAULT_STALE_INGREDIENT_MS = STALE_MS;

export { MissingFdcApiKeyError };

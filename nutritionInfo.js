import { getIngredientByItemName } from './utils/ingredientStorage.js';
import { getPendingMatch } from './utils/nutritionMatching.js';
import { gramsForUnit, formatDisplayValue } from './utils/fdcNutrientMap.js';
import { initUomTable, convert } from './utils/uomConverter.js';

const GRAMS_PER_OUNCE = 28.349523125;

let itemName = '';
let uomInitPromise = null;

const WEIGHT_UNITS = new Set([
  'g',
  'gram',
  'grams',
  'kg',
  'kilogram',
  'kilograms',
  'mg',
  'milligram',
  'milligrams',
  'mcg',
  'ug',
  'µg',
  'microgram',
  'micrograms',
  'oz',
  'ounce',
  'ounces',
  'lb',
  'pound',
  'pounds'
]);

function ensureUomTableLoaded() {
  if (!initUomTable) return Promise.resolve();
  if (!uomInitPromise) {
    uomInitPromise = initUomTable().catch(err => {
      console.warn('Unable to initialize unit conversion table', err);
    });
  }
  return uomInitPromise;
}

async function computeGramsPerDefaultUnit(unit) {
  if (!unit) return null;
  const normalized = unit.trim().toLowerCase();
  if (!normalized) return null;

  if (WEIGHT_UNITS.has(normalized)) {
    try {
      await ensureUomTableLoaded();
      const converted = convert(1, normalized, 'g');
      if (Number.isFinite(converted)) {
        if (Math.abs(converted - 1) < 1e-6 && !['g', 'gram', 'grams'].includes(normalized)) {
          // Conversion table may not define this unit; fall back to manual mapping.
        } else {
          return converted;
        }
      }
    } catch (error) {
      console.warn('Failed to convert default unit to grams via uomConverter', error);
    }
  }

  const fallback = gramsForUnit(unit);
  return Number.isFinite(fallback) ? fallback : null;
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || '';
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatConfidence(confidence) {
  if (confidence == null || Number.isNaN(confidence)) return '—';
  return `${(Math.max(0, Math.min(1, confidence)) * 100).toFixed(1)}%`;
}

function renderStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = `status ${type}`.trim();
}

function renderMeta(record, gramsPerUnit) {
  const metaEl = document.getElementById('meta');
  if (!metaEl) return;
  if (!record) {
    metaEl.innerHTML = '';
    return;
  }
  const rows = [
    `<div><strong>Item:</strong> ${record.display_name || itemName}</div>`,
    `<div><strong>FDC Description:</strong> ${record.fdc_description || '—'}</div>`,
    `<div><strong>Data Type:</strong> ${record.fdc_data_type || '—'}</div>`,
    `<div><strong>Default Unit:</strong> ${record.unit_default || '—'}</div>`,
    `<div><strong>Confidence:</strong> ${formatConfidence(record.confidence)}</div>`,
    `<div><strong>Last Synced:</strong> ${formatDate(record.last_checked_at)}</div>`
  ];
  if (record.unit_default && gramsPerUnit != null) {
    rows.push(
      `<div class="meta-secondary">≈ ${formatDisplayValue(gramsPerUnit, 'g', 2)} per ${record.unit_default}</div>`
    );
  }
  metaEl.innerHTML = rows.join('');
}

function renderNutrients(record, gramsPerUnit) {
  const output = document.getElementById('nutritionOutput');
  if (!output) return;
  if (!record || !record.nutrients || !record.nutrients.length) {
    output.textContent = 'No nutrient data is stored for this item yet.';
    return;
  }
  const unitLabel = record.unit_default || 'unit';
  const ouncesPerUnit =
    gramsPerUnit != null && Number.isFinite(gramsPerUnit) && gramsPerUnit > 0
      ? gramsPerUnit / GRAMS_PER_OUNCE
      : null;
  const lines = record.nutrients.map(n => {
    const per100g =
      n.displayPer100g != null
        ? formatDisplayValue(n.displayPer100g, n.displayUnit, n.decimals)
        : '—';
    let perUnitText = '';
    let perOunceText = '';
    if (n.displayPerGram != null) {
      if (gramsPerUnit != null) {
        const perUnitValue = n.displayPerGram * gramsPerUnit;
        perUnitText = formatDisplayValue(perUnitValue, n.displayUnit, n.decimals);
        if (ouncesPerUnit && Number.isFinite(ouncesPerUnit) && ouncesPerUnit > 0) {
          const perOunceValue = perUnitValue / ouncesPerUnit;
          perOunceText = formatDisplayValue(perOunceValue, n.displayUnit, n.decimals);
        }
      } else {
        const perOunceValue = n.displayPerGram * GRAMS_PER_OUNCE;
        perOunceText = formatDisplayValue(perOunceValue, n.displayUnit, n.decimals);
      }
    }
    const segments = [];
    if (perUnitText) {
      segments.push(`${perUnitText} per ${unitLabel}`);
    }
    if (perOunceText) {
      segments.push(`per oz: ${perOunceText}`);
    }
    if (n.displayPer100g != null) {
      segments.push(`per 100g: ${per100g}`);
    }
    if (!segments.length) {
      segments.push('No value available');
    }
    return `${n.label}: ${segments.join(' | ')}`;
  });
  output.textContent = lines.join('\n');
}

async function loadRecord() {
  const record = await getIngredientByItemName(itemName);
  const pending = await getPendingMatch(itemName);
  const gramsPerUnit = record ? await computeGramsPerDefaultUnit(record.unit_default) : null;
  renderMeta(record, gramsPerUnit);
  if (pending) {
    renderStatus('A match confirmation is pending. Complete the review to load nutrient data.', 'warning');
  } else if (!record || !record.nutrients || !record.nutrients.length) {
    renderStatus('Nutrition data has not been synced yet. Use the Sync Nutrition button on the inventory timeline.', 'warning');
  } else {
    renderStatus('');
  }
  renderNutrients(record, gramsPerUnit);
}

document.addEventListener('DOMContentLoaded', () => {
  itemName = getQueryParam('item');
  if (!itemName) {
    renderStatus('No item provided.', 'error');
    document.getElementById('nutritionOutput').textContent = '';
    return;
  }
  loadRecord();

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.ingredientRecords || changes.pendingIngredientMatches) {
        loadRecord();
      }
    });
  }
});

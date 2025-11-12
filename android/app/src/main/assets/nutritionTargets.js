import { NUTRIENT_DEFINITIONS } from './utils/fdcNutrientMap.js';
import {
  loadNutritionTargets,
  saveNutritionTargets,
  getSupportedUnitsForDefinition,
  getDefaultUnitForDefinition,
  convertBetweenMassUnits,
  convertTargetValueToBase,
  convertTargetValueToUnit
} from './utils/nutritionTargets.js';

const definitions = Array.isArray(NUTRIENT_DEFINITIONS)
  ? NUTRIENT_DEFINITIONS.slice()
  : [];

const targetsBody = document.getElementById('targetsBody');
const statusEl = document.getElementById('status');
const clearBtn = document.getElementById('clearTargetsBtn');
const formEl = document.getElementById('targetsForm');

const rowState = new Map();
let statusTimer = null;

function formatNumber(value) {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';
  if (Math.abs(value) >= 1000) {
    return Math.round(value).toString();
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function setStatus(message, isError = false) {
  if (!statusEl) return;
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  statusEl.textContent = message || '';
  statusEl.classList.toggle('error', Boolean(isError));
  if (message) {
    statusTimer = setTimeout(() => {
      statusEl.textContent = '';
      statusEl.classList.remove('error');
      statusTimer = null;
    }, 4000);
  }
}

function clearStatus() {
  setStatus('', false);
}

function convertValue(value, fromUnit, toUnit, definition) {
  if (!Number.isFinite(value)) return value;
  if (!definition || fromUnit === toUnit) return value;
  if (definition.targetUnit === 'kcal') {
    return value;
  }
  const direct = convertBetweenMassUnits(value, fromUnit, toUnit);
  if (direct != null) return direct;
  const base = convertTargetValueToBase(value, fromUnit, definition);
  if (base == null) return value;
  const converted = convertTargetValueToUnit(base, toUnit, definition);
  return converted != null ? converted : value;
}

function handleUnitChange(state, nextUnit) {
  if (!state || !nextUnit) return;
  const { input, currentUnit, definition } = state;
  if (!input) return;
  const raw = input.value.trim();
  state.currentUnit = nextUnit;
  if (!raw) return;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return;
  const converted = convertValue(numeric, currentUnit, nextUnit, definition);
  if (converted != null) {
    input.value = formatNumber(converted);
  }
}

function createRow(definition) {
  const row = document.createElement('tr');
  const labelCell = document.createElement('th');
  labelCell.scope = 'row';
  const label = document.createElement('label');
  label.htmlFor = `target-${definition.key}`;
  label.textContent = definition.label || definition.key;
  labelCell.appendChild(label);
  if (definition.displayUnit && definition.displayUnit !== definition.targetUnit) {
    const hint = document.createElement('span');
    hint.className = 'unit-hint';
    hint.textContent = `Typically shown as ${definition.displayUnit}`;
    labelCell.appendChild(hint);
  }

  const valueCell = document.createElement('td');
  const wrapper = document.createElement('div');
  wrapper.className = 'target-inputs';

  const input = document.createElement('input');
  input.type = 'number';
  input.id = `target-${definition.key}`;
  input.min = '0';
  input.step = 'any';
  input.placeholder = '0';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.addEventListener('input', () => {
    input.classList.remove('error');
    clearStatus();
  });

  const select = document.createElement('select');
  const units = getSupportedUnitsForDefinition(definition);
  units.forEach(unit => {
    const option = document.createElement('option');
    option.value = unit;
    option.textContent = unit === 'kcal'
      ? 'Kilocalories (kcal)'
      : unit === 'mg'
      ? 'Milligrams (mg)'
      : 'Grams (g)';
    select.appendChild(option);
  });
  if (units.length <= 1) {
    select.disabled = true;
  }

  wrapper.appendChild(input);
  wrapper.appendChild(select);
  valueCell.appendChild(wrapper);

  row.appendChild(labelCell);
  row.appendChild(valueCell);
  targetsBody.appendChild(row);

  const state = { definition, input, select, currentUnit: getDefaultUnitForDefinition(definition) };
  select.value = state.currentUnit;
  select.addEventListener('change', () => {
    const nextUnit = select.value;
    handleUnitChange(state, nextUnit);
  });

  rowState.set(definition.key, state);
}

function ensureRows() {
  if (!targetsBody || rowState.size) return;
  definitions.forEach(def => {
    if (!def || !def.key) return;
    createRow(def);
  });
}

function populateTargets(targets = {}) {
  rowState.forEach(state => {
    const { definition, input, select } = state;
    const entry = targets[definition.key];
    const units = getSupportedUnitsForDefinition(definition);
    let activeUnit = state.currentUnit;
    if (entry && units.includes(entry.unit)) {
      activeUnit = entry.unit;
    } else if (!units.includes(activeUnit)) {
      activeUnit = getDefaultUnitForDefinition(definition);
    }
    state.currentUnit = activeUnit;
    select.value = activeUnit;

    if (entry && Number.isFinite(entry.value)) {
      const value = entry.unit === activeUnit
        ? entry.value
        : convertValue(entry.value, entry.unit, activeUnit, definition);
      input.value = value != null ? formatNumber(value) : '';
    } else {
      input.value = '';
    }
    input.classList.remove('error');
  });
}

function gatherTargets() {
  const payload = {};
  let invalid = null;
  rowState.forEach(state => {
    const { definition, input, select } = state;
    const raw = input.value.trim();
    input.classList.remove('error');
    if (!raw) {
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      input.classList.add('error');
      if (!invalid) invalid = input;
      return;
    }
    payload[definition.key] = {
      value: numeric,
      unit: select.value
    };
  });
  return { payload, invalid };
}

function clearAllTargets() {
  rowState.forEach(state => {
    const { definition, input, select } = state;
    const defaultUnit = getDefaultUnitForDefinition(definition);
    state.currentUnit = defaultUnit;
    select.value = defaultUnit;
    input.value = '';
    input.classList.remove('error');
  });
  clearStatus();
}

async function initialize() {
  ensureRows();
  const stored = await loadNutritionTargets(definitions);
  populateTargets(stored);
}

if (formEl) {
  formEl.addEventListener('submit', async event => {
    event.preventDefault();
    const { payload, invalid } = gatherTargets();
    if (invalid) {
      setStatus('Enter a positive number for highlighted nutrients.', true);
      invalid.focus();
      return;
    }
    await saveNutritionTargets(payload);
    setStatus('Nutrition targets saved.');
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    clearAllTargets();
    setStatus('Targets cleared. Remember to save to persist this change.');
  });
}

initialize().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Failed to load nutrition targets', err);
  setStatus('Unable to load saved targets.', true);
});

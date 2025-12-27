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
const rankOwnership = new Map();
let statusTimer = null;

const IMPORTANCE_DIRECTIONS = [
  { value: 'maximize', label: 'Maximize (more is better)' },
  { value: 'minimize', label: 'Minimize (keep low)' }
];

function normalizeDirection(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized === 'minimize' ? 'minimize' : 'maximize';
}

function normalizeRank(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.round(numeric);
  }
  return fallback;
}

function getEffectiveRank(state) {
  if (!state) return 1;
  return state.currentRank != null ? state.currentRank : state.defaultRank;
}

function rebuildRankOwnership() {
  rankOwnership.clear();
  rowState.forEach(state => {
    const rank = getEffectiveRank(state);
    rankOwnership.set(rank, state);
    state.rankInput.value = String(rank);
  });
}

function assignRank(state, desiredRank, { swap = false } = {}) {
  if (!state) return;
  const nextRank = Math.max(1, desiredRank || getEffectiveRank(state));
  const previousRank = getEffectiveRank(state);
  if (previousRank === nextRank) {
    state.rankInput.value = String(nextRank);
    rankOwnership.set(nextRank, state);
    state.currentRank = nextRank;
    return;
  }
  const displacedOwner = rankOwnership.get(nextRank);
  if (rankOwnership.get(previousRank) === state) {
    rankOwnership.delete(previousRank);
  }
  state.currentRank = nextRank;
  state.rankInput.value = String(nextRank);
  rankOwnership.set(nextRank, state);
  if (displacedOwner && displacedOwner !== state) {
    if (swap) {
      assignRank(displacedOwner, previousRank, { swap: false });
    } else {
      displacedOwner.currentRank = getEffectiveRank(displacedOwner);
      displacedOwner.rankInput.value = String(displacedOwner.currentRank);
      rankOwnership.set(displacedOwner.currentRank, displacedOwner);
    }
  }
}

function applyRankOrdering() {
  if (!targetsBody) return;
  const ordered = Array.from(rowState.values()).sort((a, b) => {
    const rankA = getEffectiveRank(a);
    const rankB = getEffectiveRank(b);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.defaultRank - b.defaultRank;
  });
  ordered.forEach(state => {
    if (state.row && state.row.parentElement === targetsBody) {
      targetsBody.appendChild(state.row);
    }
  });
}

function commitRankInput(state, { swap = false, reorder = false } = {}) {
  if (!state) return;
  const fallback = getEffectiveRank(state);
  const desired = normalizeRank(state.rankInput.value, fallback);
  assignRank(state, desired, { swap });
  if (reorder) {
    applyRankOrdering();
  }
}

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

function convertFieldValue(field, fromUnit, toUnit, definition) {
  if (!field) return;
  const raw = field.value.trim();
  if (!raw) return;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return;
  const converted = convertValue(numeric, fromUnit, toUnit, definition);
  if (converted != null) {
    field.value = formatNumber(converted);
  }
}

function syncUnitMetadata(state) {
  if (!state) return;
  const unitLabel = state.currentUnit || '';
  if (state.input) {
    state.input.placeholder = unitLabel ? `0 (${unitLabel})` : '0';
    state.input.title = unitLabel ? `Daily target in ${unitLabel}` : 'Daily target';
  }
  if (state.upperLimitInput) {
    state.upperLimitInput.placeholder = unitLabel ? `0 (${unitLabel})` : '0';
    state.upperLimitInput.title = unitLabel
      ? `Safe upper limit in ${unitLabel}`
      : 'Safe upper limit';
  }
}

function handleUnitChange(state, nextUnit) {
  if (!state || !nextUnit) return;
  const { input, upperLimitInput, currentUnit, definition } = state;
  if (!input) return;
  const fromUnit = currentUnit;
  state.currentUnit = nextUnit;
  convertFieldValue(input, fromUnit, nextUnit, definition);
  convertFieldValue(upperLimitInput, fromUnit, nextUnit, definition);
  syncUnitMetadata(state);
}

function createRow(definition, index = 0) {
  const row = document.createElement('tr');
  const labelCell = document.createElement('th');
  labelCell.scope = 'row';
  const label = document.createElement('label');
  const labelText = definition.label || definition.key;
  label.htmlFor = `target-${definition.key}`;
  label.textContent = labelText;
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
      : unit === 'mcg'
      ? 'Micrograms (mcg)'
      : 'Grams (g)';
    select.appendChild(option);
  });
  if (units.length <= 1) {
    select.disabled = true;
  }

  wrapper.appendChild(input);
  wrapper.appendChild(select);
  valueCell.appendChild(wrapper);

  const upperLimitCell = document.createElement('td');
  const upperWrapper = document.createElement('div');
  upperWrapper.className = 'target-inputs';

  const upperLimitInput = document.createElement('input');
  upperLimitInput.type = 'number';
  upperLimitInput.id = `upper-limit-${definition.key}`;
  upperLimitInput.min = '0';
  upperLimitInput.step = 'any';
  upperLimitInput.placeholder = '0';
  upperLimitInput.inputMode = 'decimal';
  upperLimitInput.autocomplete = 'off';
  upperLimitInput.setAttribute('aria-label', `Safe upper limit for ${labelText}`);
  upperLimitInput.addEventListener('input', () => {
    upperLimitInput.classList.remove('error');
    clearStatus();
  });

  upperWrapper.appendChild(upperLimitInput);
  upperLimitCell.appendChild(upperWrapper);

  const rankCell = document.createElement('td');
  const rankInput = document.createElement('input');
  rankInput.type = 'number';
  rankInput.min = '1';
  rankInput.step = '1';
  rankInput.inputMode = 'numeric';
  rankInput.autocomplete = 'off';
  rankInput.className = 'importance-rank-input';
  rankInput.value = String(index + 1);
  rankInput.setAttribute('aria-label', `Importance rank for ${labelText}`);
  rankInput.addEventListener('input', () => {
    rankInput.classList.remove('error');
    clearStatus();
  });
  rankInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitRankInput(state, { swap: true, reorder: true });
      rankInput.blur();
    }
  });
  rankInput.addEventListener('blur', () => {
    commitRankInput(state, { swap: true, reorder: true });
  });
  rankCell.appendChild(rankInput);

  const directionCell = document.createElement('td');
  const directionSelect = document.createElement('select');
  directionSelect.className = 'importance-direction-select';
  directionSelect.id = `direction-${definition.key}`;
  directionSelect.setAttribute('aria-label', `Goal direction for ${labelText}`);
  IMPORTANCE_DIRECTIONS.forEach(({ value, label: optionLabel }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = optionLabel;
    directionSelect.appendChild(option);
  });
  directionSelect.value = 'maximize';
  directionSelect.addEventListener('change', () => {
    clearStatus();
  });
  directionCell.appendChild(directionSelect);

  row.appendChild(labelCell);
  row.appendChild(valueCell);
  row.appendChild(upperLimitCell);
  row.appendChild(rankCell);
  row.appendChild(directionCell);
  targetsBody.appendChild(row);

  const state = {
    definition,
    row,
    input,
    upperLimitInput,
    select,
    rankInput,
    directionSelect,
    currentUnit: getDefaultUnitForDefinition(definition),
    defaultRank: index + 1,
    currentRank: index + 1
  };
  select.value = state.currentUnit;
  syncUnitMetadata(state);
  select.addEventListener('change', () => {
    const nextUnit = select.value;
    handleUnitChange(state, nextUnit);
  });

  rowState.set(definition.key, state);
  rankOwnership.set(state.currentRank, state);
}

function ensureRows() {
  if (!targetsBody || rowState.size) return;
  definitions.forEach((def, index) => {
    if (!def || !def.key) return;
    createRow(def, index);
  });
}

function populateTargets(targets = {}) {
  rowState.forEach(state => {
    const {
      definition,
      input,
      upperLimitInput,
      select,
      rankInput,
      directionSelect,
      defaultRank
    } = state;
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
    syncUnitMetadata(state);

    if (entry && Number.isFinite(entry.value)) {
      const value = entry.unit === activeUnit
        ? entry.value
        : convertValue(entry.value, entry.unit, activeUnit, definition);
      input.value = value != null ? formatNumber(value) : '';
    } else {
      input.value = '';
    }
    if (upperLimitInput) {
      if (entry && Number.isFinite(entry.upperLimitValue)) {
        const upperUnit = entry.upperLimitUnit && units.includes(entry.upperLimitUnit)
          ? entry.upperLimitUnit
          : entry.unit;
        const upperValue = upperUnit === activeUnit
          ? entry.upperLimitValue
          : convertValue(entry.upperLimitValue, upperUnit, activeUnit, definition);
        upperLimitInput.value = upperValue != null ? formatNumber(upperValue) : '';
      } else {
        upperLimitInput.value = '';
      }
      upperLimitInput.classList.remove('error');
    }
    input.classList.remove('error');
    const nextRank = entry ? normalizeRank(entry.importanceRank, defaultRank) : defaultRank;
    state.currentRank = nextRank;
    rankInput.value = String(nextRank);
    rankInput.classList.remove('error');
    const direction = entry ? normalizeDirection(entry.importanceDirection) : 'maximize';
    directionSelect.value = direction;
  });
  rebuildRankOwnership();
  applyRankOrdering();
}

function gatherTargets() {
  const payload = {};
  let invalid = null;
  rowState.forEach(state => {
    const { definition, input, upperLimitInput, select, directionSelect } = state;
    commitRankInput(state, { swap: true });
    const raw = input.value.trim();
    input.classList.remove('error');
    if (upperLimitInput) {
      upperLimitInput.classList.remove('error');
    }
    if (!raw) {
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      input.classList.add('error');
      if (!invalid) invalid = input;
      return;
    }
    const normalizedRank = getEffectiveRank(state);
    const direction = normalizeDirection(directionSelect.value);
    const entry = {
      value: numeric,
      unit: select.value,
      importanceRank: normalizedRank,
      importanceDirection: direction
    };
    if (upperLimitInput) {
      const upperRaw = upperLimitInput.value.trim();
      if (upperRaw) {
        const upperNumeric = Number(upperRaw);
        if (!Number.isFinite(upperNumeric) || upperNumeric <= 0 || upperNumeric <= numeric) {
          upperLimitInput.classList.add('error');
          if (!invalid) invalid = upperLimitInput;
          return;
        }
        entry.upperLimitValue = upperNumeric;
        entry.upperLimitUnit = select.value;
      }
    }
    payload[definition.key] = entry;
  });
  return { payload, invalid };
}

function clearAllTargets() {
  rowState.forEach(state => {
    const {
      definition,
      input,
      upperLimitInput,
      select,
      rankInput,
      directionSelect,
      defaultRank
    } = state;
    const defaultUnit = getDefaultUnitForDefinition(definition);
    state.currentUnit = defaultUnit;
    select.value = defaultUnit;
    input.value = '';
    input.classList.remove('error');
    if (upperLimitInput) {
      upperLimitInput.value = '';
      upperLimitInput.classList.remove('error');
    }
    state.currentRank = defaultRank;
    rankInput.value = String(defaultRank);
    rankInput.classList.remove('error');
    directionSelect.value = 'maximize';
    syncUnitMetadata(state);
  });
  rebuildRankOwnership();
  applyRankOrdering();
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
      setStatus('Enter valid values for the highlighted fields.', true);
      invalid.focus();
      return;
    }
    await saveNutritionTargets(payload);
    setStatus('Nutrition targets and importance saved.');
  });
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    clearAllTargets();
    setStatus('Targets cleared and importance reset. Remember to save to persist this change.');
  });
}

initialize().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Failed to load nutrition targets', err);
  setStatus('Unable to load saved targets.', true);
});

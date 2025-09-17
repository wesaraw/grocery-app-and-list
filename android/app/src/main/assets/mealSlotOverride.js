import { loadUsers } from './utils/userData.js';
import {
  MEAL_TYPES,
  initializeMealCategories
} from './utils/mealData.js';
import {
  loadMealSlotOverrides,
  saveMealSlotOverrides,
  generateMealSlotOverrideId,
  MEAL_SLOT_OVERRIDE_DAYS,
  normalizeOverrideDays,
  loadMealSlotDescriptors
} from './utils/mealSlotOverrides.js';

const DAY_ABBREVIATIONS = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun'
};

const grid = document.getElementById('overrideGrid');
const summaryContainer = document.getElementById('overrideSummary');

let users = [];
let slots = [];
let overrides = [];
const slotMap = new Map();
const cellRegistry = new Map();
let activePicker = null;

function ordinal(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

function getCategoryLabel(id) {
  const cat = MEAL_TYPES[id];
  return cat ? cat.label || id : id;
}

function applySlots(descriptors) {
  slots = Array.isArray(descriptors)
    ? descriptors.map(descriptor => ({
      id: descriptor.id,
      categoryId: descriptor.sourceCategoryId,
      index: descriptor.slotIndex,
      roleLabel: descriptor.roleLabel,
      defaultLabel: descriptor.categoryLabel
    }))
    : [];
  slotMap.clear();
  slots.forEach(slot => {
    slotMap.set(slot.id, slot);
  });
}

function closeActivePicker() {
  if (!activePicker) return;
  const { overlay, outsideHandler, keyHandler } = activePicker;
  overlay.remove();
  document.removeEventListener('mousedown', outsideHandler);
  document.removeEventListener('keydown', keyHandler);
  activePicker = null;
}

function openPicker(anchor, options, onSelect, currentValue = null) {
  closeActivePicker();
  if (!options || !options.length) return;
  const overlay = document.createElement('div');
  overlay.className = 'picker-overlay';

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    if (opt.value === currentValue) {
      btn.dataset.selected = 'true';
    }
    btn.addEventListener('click', () => {
      onSelect(opt.value);
      closeActivePicker();
    });
    overlay.appendChild(btn);
  });

  const rect = anchor.getBoundingClientRect();
  overlay.style.top = `${rect.bottom + window.scrollY + 4}px`;
  overlay.style.left = `${rect.left + window.scrollX}px`;

  const outsideHandler = event => {
    if (!overlay.contains(event.target) && event.target !== anchor) {
      closeActivePicker();
    }
  };
  const keyHandler = event => {
    if (event.key === 'Escape') {
      closeActivePicker();
    }
  };

  activePicker = { overlay, outsideHandler, keyHandler };
  document.body.appendChild(overlay);
  setTimeout(() => {
    document.addEventListener('mousedown', outsideHandler);
    document.addEventListener('keydown', keyHandler);
  }, 0);
}

window.addEventListener('resize', closeActivePicker);
window.addEventListener('scroll', () => closeActivePicker(), true);

function getSlotMeta(slotId) {
  return slotMap.get(slotId) || null;
}

function registerCell(userIndex, slotId, controller) {
  cellRegistry.set(`${userIndex}:${slotId}`, controller);
}

function getCellController(userIndex, slotId) {
  return cellRegistry.get(`${userIndex}:${slotId}`) || null;
}

function createCell(userIndex, slot) {
  const cell = document.createElement('td');
  cell.className = 'grid-cell';
  cell.dataset.userIndex = String(userIndex);
  cell.dataset.slotId = slot.id;

  const chipRow = document.createElement('div');
  chipRow.className = 'chip-row';

  const roleChip = document.createElement('button');
  roleChip.type = 'button';
  roleChip.className = 'chip role-chip';
  roleChip.textContent = slot.roleLabel;

  const typeChip = document.createElement('button');
  typeChip.type = 'button';
  typeChip.className = 'chip type-chip';
  typeChip.textContent = slot.defaultLabel;
  typeChip.dataset.changed = 'false';

  chipRow.appendChild(roleChip);
  chipRow.appendChild(typeChip);

  const dayContainer = document.createElement('div');
  dayContainer.className = 'day-checkboxes';

  const dayInputs = new Map();
  MEAL_SLOT_OVERRIDE_DAYS.forEach(day => {
    const label = document.createElement('label');
    label.className = 'day-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = day;
    label.appendChild(input);
    label.appendChild(document.createTextNode(DAY_ABBREVIATIONS[day] || day.slice(0, 3)));
    dayContainer.appendChild(label);
    dayInputs.set(day, input);
  });

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'apply-btn hidden';
  applyBtn.textContent = 'Apply';

  cell.appendChild(chipRow);
  cell.appendChild(dayContainer);
  cell.appendChild(applyBtn);

  const state = {
    baseSlotId: slot.id,
    selectedSlotId: slot.id,
    overrideCategoryId: slot.categoryId,
    days: new Set()
  };

  function setEditing(isEditing) {
    if (isEditing) {
      cell.classList.add('editing');
    } else {
      cell.classList.remove('editing');
    }
  }

  function updateRoleChip() {
    const meta = getSlotMeta(state.selectedSlotId);
    roleChip.textContent = meta ? meta.roleLabel : slot.roleLabel;
  }

  function updateTypeChip() {
    typeChip.textContent = getCategoryLabel(state.overrideCategoryId);
    const meta = getSlotMeta(state.selectedSlotId);
    const defaultCategory = meta ? meta.categoryId : slot.categoryId;
    const changed = !!meta && state.overrideCategoryId !== defaultCategory;
    typeChip.dataset.changed = changed ? 'true' : 'false';
    return changed;
  }

  function updateApplyVisibility() {
    const meta = getSlotMeta(state.selectedSlotId);
    const defaultCategory = meta ? meta.categoryId : slot.categoryId;
    const typeChanged = meta ? state.overrideCategoryId !== defaultCategory : false;
    const daysSelected = state.days.size > 0;
    if (typeChanged && daysSelected) {
      applyBtn.classList.remove('hidden');
    } else {
      applyBtn.classList.add('hidden');
    }
  }

  function resetDays() {
    state.days.clear();
    dayInputs.forEach(input => {
      input.checked = false;
    });
  }

  function resetState() {
    closeActivePicker();
    state.selectedSlotId = state.baseSlotId;
    state.overrideCategoryId = slot.categoryId;
    resetDays();
    updateRoleChip();
    updateTypeChip();
    updateApplyVisibility();
    setEditing(false);
  }

  roleChip.addEventListener('click', () => {
    const options = slots.map(optSlot => ({
      value: optSlot.id,
      label: `${optSlot.roleLabel} – ${optSlot.defaultLabel}`
    }));
    openPicker(roleChip, options, value => {
      if (state.selectedSlotId !== value) {
        state.selectedSlotId = value;
        const meta = getSlotMeta(state.selectedSlotId);
        if (meta) {
          state.overrideCategoryId = meta.categoryId;
        }
        updateRoleChip();
        updateTypeChip();
        updateApplyVisibility();
      }
    }, state.selectedSlotId);
  });

  typeChip.addEventListener('click', () => {
    const options = Object.keys(MEAL_TYPES).map(id => ({
      value: id,
      label: getCategoryLabel(id)
    }));
    openPicker(typeChip, options, value => {
      if (state.overrideCategoryId !== value) {
        state.overrideCategoryId = value;
        updateTypeChip();
        updateApplyVisibility();
      }
    }, state.overrideCategoryId);
  });

  dayInputs.forEach((input, day) => {
    input.addEventListener('change', () => {
      if (input.checked) {
        state.days.add(day);
      } else {
        state.days.delete(day);
      }
      updateApplyVisibility();
    });
  });

  applyBtn.addEventListener('click', async () => {
    const meta = getSlotMeta(state.selectedSlotId);
    if (!meta) return;
    if (state.days.size === 0) return;
    const defaultCategory = meta.categoryId;
    if (state.overrideCategoryId === defaultCategory) return;
    const record = {
      id: generateMealSlotOverrideId(),
      userIndex,
      sourceCategoryId: meta.categoryId,
      slotIndex: meta.index,
      overrideCategoryId: state.overrideCategoryId,
      days: normalizeOverrideDays(Array.from(state.days))
    };
    overrides.push(record);
    await saveMealSlotOverrides(overrides);
    renderOverridesList();
    resetState();
  });

  const controller = {
    element: cell,
    reset: resetState,
    loadOverride(record) {
      const slotId = `${record.sourceCategoryId}:${record.slotIndex}`;
      const meta = getSlotMeta(slotId);
      state.selectedSlotId = meta ? slotId : state.baseSlotId;
      state.overrideCategoryId = record.overrideCategoryId;
      state.days = new Set(normalizeOverrideDays(record.days));
      dayInputs.forEach((input, day) => {
        input.checked = state.days.has(day);
      });
      updateRoleChip();
      const changed = updateTypeChip();
      updateApplyVisibility();
      setEditing(changed || state.days.size > 0);
    }
  };

  registerCell(userIndex, slot.id, controller);

  return cell;
}

function renderGrid() {
  grid.innerHTML = '';
  cellRegistry.clear();
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const userHeader = document.createElement('th');
  userHeader.textContent = 'Person';
  headerRow.appendChild(userHeader);

  if (!slots.length) {
    const th = document.createElement('th');
    th.textContent = 'Slots';
    headerRow.appendChild(th);
  } else {
    slots.forEach(slot => {
      const th = document.createElement('th');
      const wrapper = document.createElement('div');
      wrapper.className = 'slot-header';
      const role = document.createElement('span');
      role.className = 'role';
      role.textContent = slot.roleLabel;
      const type = document.createElement('span');
      type.className = 'type';
      type.textContent = slot.defaultLabel;
      wrapper.appendChild(role);
      wrapper.appendChild(type);
      th.appendChild(wrapper);
      headerRow.appendChild(th);
    });
  }

  thead.appendChild(headerRow);
  grid.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!users.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = slots.length + 1;
    cell.className = 'no-data';
    cell.textContent = 'Add users in the Users window to configure overrides.';
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    users.forEach((name, index) => {
      const row = document.createElement('tr');
      const userCell = document.createElement('td');
      userCell.className = 'user-cell';
      userCell.textContent = name || `User ${index + 1}`;
      row.appendChild(userCell);

      if (!slots.length) {
        const infoCell = document.createElement('td');
        infoCell.colSpan = 1;
        infoCell.className = 'no-data';
        infoCell.textContent = 'No meal slots configured. Update meal multipliers first.';
        row.appendChild(infoCell);
      } else {
        slots.forEach(slot => {
          const cell = createCell(index, slot);
          row.appendChild(cell);
        });
      }

      tbody.appendChild(row);
    });
  }

  grid.appendChild(tbody);
}

function describeDays(days) {
  if (!days || !days.length) return '—';
  return MEAL_SLOT_OVERRIDE_DAYS.filter(day => days.includes(day))
    .map(day => DAY_ABBREVIATIONS[day] || day.slice(0, 3))
    .join(', ');
}

function renderOverridesList() {
  const listContainer = document.createElement('div');
  if (!overrides.length) {
    const empty = document.createElement('p');
    empty.className = 'no-data';
    empty.textContent = 'No overrides have been saved yet.';
    listContainer.appendChild(empty);
  } else {
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Person', 'Role Slot', 'Override Type', 'Days', 'Actions'].forEach(title => {
      const th = document.createElement('th');
      th.textContent = title;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    overrides.forEach(record => {
      const row = document.createElement('tr');
      const userCell = document.createElement('td');
      userCell.textContent = users[record.userIndex] || `User ${record.userIndex + 1}`;
      row.appendChild(userCell);

      const slotCell = document.createElement('td');
      const slotId = `${record.sourceCategoryId}:${record.slotIndex}`;
      const slotMeta = getSlotMeta(slotId);
      const slotLabel = slotMeta
        ? `${slotMeta.roleLabel} – ${slotMeta.defaultLabel}`
        : `${ordinal(record.slotIndex + 1)} – ${getCategoryLabel(record.sourceCategoryId)}`;
      slotCell.textContent = slotLabel;
      row.appendChild(slotCell);

      const typeCell = document.createElement('td');
      typeCell.textContent = getCategoryLabel(record.overrideCategoryId);
      row.appendChild(typeCell);

      const daysCell = document.createElement('td');
      daysCell.textContent = describeDays(record.days);
      row.appendChild(daysCell);

      const actionCell = document.createElement('td');
      actionCell.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', async () => {
        const controller = getCellController(record.userIndex, slotId);
        if (!controller) {
          window.alert('The meal slot for this override is no longer available. Update meal multipliers and try again.');
          return;
        }
        overrides = overrides.filter(o => o.id !== record.id);
        await saveMealSlotOverrides(overrides);
        renderOverridesList();
        controller.loadOverride(record);
      });
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Remove';
      deleteBtn.addEventListener('click', async () => {
        overrides = overrides.filter(o => o.id !== record.id);
        await saveMealSlotOverrides(overrides);
        renderOverridesList();
      });
      actionCell.appendChild(editBtn);
      actionCell.appendChild(deleteBtn);
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    listContainer.appendChild(table);
  }

  summaryContainer.innerHTML = '<h2>Saved Overrides</h2>';
  summaryContainer.appendChild(listContainer);
}

async function init() {
  await initializeMealCategories();
  const [loadedUsers, descriptorData, storedOverrides] = await Promise.all([
    loadUsers(),
    loadMealSlotDescriptors(),
    loadMealSlotOverrides()
  ]);
  users = Array.isArray(loadedUsers) ? loadedUsers : [];
  const descriptors = descriptorData && Array.isArray(descriptorData.descriptors)
    ? descriptorData.descriptors
    : [];
  applySlots(descriptors);
  renderGrid();
  overrides = storedOverrides;
  renderOverridesList();
}

init();

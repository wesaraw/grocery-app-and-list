import { get, set, updateItemById } from '../services/storageService.js';

const UNITS = ['', 'g', 'kg', 'oz', 'lb', 'ml', 'l', 'cup', 'tbsp', 'tsp', 'pc'];

async function renderMealForm(root, { meal = {}, category, onDone } = {}) {
  root.innerHTML = '';
  const form = document.createElement('form');
  form.dataset.mealForm = '';

  const nameInput = document.createElement('input');
  nameInput.dataset.mealNameInput = '';
  nameInput.value = meal.name || '';
  form.appendChild(nameInput);

  const preparedLabel = document.createElement('label');
  preparedLabel.textContent = 'Prepared';
  const preparedInput = document.createElement('input');
  preparedInput.type = 'checkbox';
  preparedInput.dataset.preparedInput = '';
  preparedInput.checked = !!meal.flags?.prepared;
  preparedLabel.appendChild(preparedInput);
  form.appendChild(preparedLabel);

  const prepAheadLabel = document.createElement('label');
  prepAheadLabel.textContent = 'Prep-Ahead';
  const prepAheadInput = document.createElement('input');
  prepAheadInput.type = 'checkbox';
  prepAheadInput.dataset.prepAheadInput = '';
  prepAheadInput.checked = !!meal.flags?.prepAhead;
  prepAheadLabel.appendChild(prepAheadInput);
  form.appendChild(prepAheadLabel);

  const groupLabel = document.createElement('label');
  groupLabel.textContent = 'Group';
  const groupInput = document.createElement('input');
  groupInput.type = 'checkbox';
  groupInput.dataset.groupInput = '';
  groupInput.checked = !!meal.flags?.group;
  groupLabel.appendChild(groupInput);
  form.appendChild(groupLabel);

  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.dataset.weightInput = '';
  weightInput.value = meal.weight ?? '';
  form.appendChild(weightInput);

  const recipeBookInput = document.createElement('input');
  recipeBookInput.dataset.recipeBookInput = '';
  recipeBookInput.value = meal.recipeBook || '';
  form.appendChild(recipeBookInput);

  const userSection = document.createElement('div');
  userSection.dataset.userSection = '';
  const userList = await get('users', []);
  userList.forEach(u => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = u.id;
    box.dataset.userCheckbox = u.id;
    box.checked = Array.isArray(meal.users) && meal.users.includes(u.id);
    label.append(box, document.createTextNode(u.name));
    userSection.appendChild(label);
  });
  form.appendChild(userSection);

  const table = document.createElement('table');
  table.dataset.ingredientTable = '';
  const tbody = document.createElement('tbody');
  tbody.dataset.ingredientTbody = '';
  table.appendChild(tbody);
  form.appendChild(table);

  function addRow(ing = {}) {
    const tr = document.createElement('tr');
    tr.dataset.ingredientRow = '';

    const nameTd = document.createElement('td');
    const name = document.createElement('input');
    name.dataset.ingredientNameInput = '';
    name.value = ing.name || '';
    nameTd.appendChild(name);

    const amountTd = document.createElement('td');
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.dataset.ingredientAmountInput = '';
    amount.value = ing.amount ?? '';
    amountTd.appendChild(amount);

    const unitTd = document.createElement('td');
    const unit = document.createElement('select');
    unit.dataset.ingredientUnitSelect = '';
    UNITS.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u;
      if (ing.unit === u) opt.selected = true;
      unit.appendChild(opt);
    });
    unitTd.appendChild(unit);

    const costTd = document.createElement('td');
    const cost = document.createElement('input');
    cost.type = 'number';
    cost.dataset.ingredientCostInput = '';
    cost.value = ing.cost ?? '';
    costTd.appendChild(cost);

    tr.append(nameTd, amountTd, unitTd, costTd);
    tbody.appendChild(tr);

    function maybeAdd() {
      const rows = tbody.querySelectorAll('tr');
      if (rows[rows.length - 1] === tr) {
        if (name.value || amount.value || cost.value) {
          addRow();
        }
      }
    }

    name.addEventListener('input', maybeAdd);
    amount.addEventListener('input', maybeAdd);
    cost.addEventListener('input', maybeAdd);
  }

  if (Array.isArray(meal.ingredients)) {
    meal.ingredients.forEach(addRow);
  }
  addRow();

  const actionBar = document.createElement('div');
  actionBar.dataset.formActions = '';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.textContent = 'Save';
  saveBtn.dataset.action = 'save';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.dataset.action = 'cancel';
  actionBar.append(saveBtn, cancelBtn);

  if (meal.id) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.dataset.action = 'delete';
    deleteBtn.addEventListener('click', async e => {
      e.preventDefault();
      const allMeals = await get('meals', []);
      const idx = allMeals.findIndex(m => m.id === meal.id);
      if (idx !== -1) {
        allMeals.splice(idx, 1);
        await set('meals', allMeals);
      }
      onDone && onDone();
    });
    actionBar.appendChild(deleteBtn);
  }
  form.appendChild(actionBar);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const ingredients = [];
    let invalid = false;
    tbody.querySelectorAll('tr').forEach(row => {
      const n = row.querySelector('[data-ingredient-name-input]').value.trim();
      const a = row.querySelector('[data-ingredient-amount-input]').value;
      const u = row.querySelector('[data-ingredient-unit-select]').value;
      const c = row.querySelector('[data-ingredient-cost-input]').value;
      if (!n && !a && !c) return;
      if (!n || !a) {
        invalid = true;
        return;
      }
      ingredients.push({
        name: n,
        amount: parseFloat(a),
        unit: u,
        cost: c ? parseFloat(c) : undefined
      });
    });
    if (invalid) {
      alert('Please complete all ingredient fields.');
      return;
    }
    const userIds = Array.from(
      form.querySelectorAll('[data-user-checkbox]')
    )
      .filter(cb => cb.checked)
      .map(cb => cb.value);
    const allMeals = await get('meals', []);
    const newMeal = {
      id: meal.id || Date.now().toString(),
      name: nameInput.value.trim(),
      type: meal.type || category,
      flags: {
        prepared: preparedInput.checked,
        prepAhead: prepAheadInput.checked,
        group: groupInput.checked
      },
      weight: weightInput.value ? parseFloat(weightInput.value) : null,
      recipeBook: recipeBookInput.value.trim() || null,
      users: userIds,
      ingredients,
      version: meal.version ? meal.version : 2
    };
    const exists = allMeals.some(m => m.id === newMeal.id);
    if (exists) {
      await updateItemById('meals', newMeal.id, newMeal);
    } else {
      allMeals.push(newMeal);
      await set('meals', allMeals);
    }
    onDone && onDone();
  });

  cancelBtn.addEventListener('click', e => {
    e.preventDefault();
    onDone && onDone();
  });

  root.appendChild(form);
}

var form = { renderMealForm };

export { form as default, renderMealForm };
//# sourceMappingURL=form.js.map

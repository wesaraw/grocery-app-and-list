import { get, set, updateItemById } from './storageService.js';
import { MEAL_CATEGORIES } from './constants.js';
import { renderMealForm } from './form.js';
import './meals.js';
import './users.js';
import './cookingDays.js';

async function renderMealList(root, { category } = {}) {
  const meals = await get('meals', []);
  let categories = await get('meal-categories', []);
  if (!categories.length) {
    categories = MEAL_CATEGORIES;
    await set('meal-categories', categories);
  }
  const users = await get('users', []);
  let currentCategory = category || categories[0]?.id;

  root.innerHTML = '';
  const categoryBar = document.createElement('div');
  categoryBar.dataset.categoryBar = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat.label;
    btn.dataset.categoryButton = cat.id;
    btn.addEventListener('click', () => {
      currentCategory = cat.id;
      renderMeals();
    });
    categoryBar.appendChild(btn);
  });

  const controls = document.createElement('div');
  controls.dataset.mealControls = '';
  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add Meal';
  addBtn.dataset.action = 'add-meal';
  addBtn.addEventListener('click', () => {
    renderMealForm(root, {
      category: currentCategory,
      onDone: () => renderMealList(root, { category: currentCategory })
    });
  });
  const removeBtn = document.createElement('button');
  removeBtn.textContent = 'Remove Meal';
  removeBtn.dataset.action = 'remove-meal';
  controls.append(addBtn, removeBtn);

  const listWrapper = document.createElement('div');
  listWrapper.dataset.mealList = '';

  async function renderMeals() {
    listWrapper.innerHTML = '';
    const mealsInCat = meals.filter(m => m.type === currentCategory);
    const byBook = new Map();
    mealsInCat.forEach(m => {
      const book = m.recipeBook || 'General';
      if (!byBook.has(book)) byBook.set(book, []);
      byBook.get(book).push(m);
    });

    for (const [book, arr] of byBook.entries()) {
      const details = document.createElement('details');
      details.dataset.recipeBook = book;
      const summary = document.createElement('summary');
      summary.dataset.recipeBookTitle = '';
      summary.textContent = book;
      details.appendChild(summary);

      const table = document.createElement('table');
      table.dataset.mealTable = '';
      const tbody = document.createElement('tbody');

      arr.forEach(meal => {
        const mealRow = document.createElement('tr');
        mealRow.dataset.mealId = meal.id;
        mealRow.addEventListener('click', () => {
          renderMealForm(root, {
            meal,
            category: currentCategory,
            onDone: () => renderMealList(root, { category: currentCategory })
          });
        });

        const subsCell = document.createElement('td');
        subsCell.dataset.subscribers = '';
        users.forEach(u => {
          const label = document.createElement('label');
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.dataset.userToggle = u.id;
          box.checked = Array.isArray(meal.users) && meal.users.includes(u.id);
          box.addEventListener('click', async e => {
            e.stopPropagation();
            const updated = Array.isArray(meal.users) ? [...meal.users] : [];
            if (box.checked) {
              if (!updated.includes(u.id)) updated.push(u.id);
            } else {
              const idx = updated.indexOf(u.id);
              if (idx !== -1) updated.splice(idx, 1);
            }
            meal.users = updated;
            await updateItemById('meals', meal.id, { users: updated });
          });
          label.append(box, document.createTextNode(u.name));
          subsCell.appendChild(label);
        });
        mealRow.appendChild(subsCell);

        const imgCell = document.createElement('td');
        imgCell.dataset.image = '';
        if (meal.image) {
          const img = document.createElement('img');
          img.dataset.mealImage = '';
          img.src = meal.image;
          img.alt = meal.name;
          imgCell.appendChild(img);
        }
        mealRow.appendChild(imgCell);

        const nameCell = document.createElement('td');
        nameCell.dataset.mealName = '';
        nameCell.textContent = meal.name;
        mealRow.appendChild(nameCell);

        const flagsCell = document.createElement('td');
        flagsCell.dataset.prepFlags = '';
        const flags = [];
        if (meal.flags?.prepared) flags.push('Prepared');
        if (meal.flags?.prepAhead) flags.push('Prep-Ahead');
        flagsCell.textContent = flags.join(', ');
        mealRow.appendChild(flagsCell);

        const weightCell = document.createElement('td');
        weightCell.dataset.weight = '';
        weightCell.textContent = meal.weight ?? '';
        mealRow.appendChild(weightCell);

        const groupCell = document.createElement('td');
        groupCell.dataset.group = '';
        const groupToggle = document.createElement('input');
        groupToggle.type = 'checkbox';
        groupToggle.dataset.groupToggle = '';
        groupToggle.checked = !!meal.flags?.group;
        groupCell.appendChild(groupToggle);
        mealRow.appendChild(groupCell);

        const costCell = document.createElement('td');
        costCell.dataset.totalCost = '';
        costCell.textContent = meal.totalCost ? meal.totalCost.toFixed(2) : '';
        mealRow.appendChild(costCell);

        tbody.appendChild(mealRow);

        if (Array.isArray(meal.ingredients)) {
          meal.ingredients.forEach(ing => {
            const ingRow = document.createElement('tr');
            ingRow.dataset.ingredientRow = '';

            const name = document.createElement('td');
            name.dataset.ingredientName = '';
            name.textContent = ing.name || '';
            const amount = document.createElement('td');
            amount.dataset.ingredientAmount = '';
            amount.textContent = ing.amount ?? '';
            const cost = document.createElement('td');
            cost.dataset.ingredientCost = '';
            cost.textContent = ing.cost ?? '';
            ingRow.append(name, amount, cost);
            tbody.appendChild(ingRow);
          });
        }
      });

      table.appendChild(tbody);
      details.appendChild(table);
      listWrapper.appendChild(details);
    }
  }

  await renderMeals();
  root.append(categoryBar, controls, listWrapper);
}

var index = { renderMealList };

export { index as default, renderMealList };
//# sourceMappingURL=index5.js.map

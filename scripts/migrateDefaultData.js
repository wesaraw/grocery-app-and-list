import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const v1Dir = path.resolve(__dirname, '..', 'Version Old', 'Required for grocery app');
const outDir = path.resolve(__dirname, '..', 'extension', 'default-data');

function parseAmount(text) {
  if (!text) return { amount: 0, unit: '' };
  const [numStr, ...unitParts] = text.split(/\s+/);
  let amount = Number(numStr);
  if (Number.isNaN(amount)) {
    try {
      amount = Function(`return (${numStr})`)();
    } catch {
      amount = 0;
    }
  }
  const unit = unitParts.join(' ');
  return { amount, unit };
}

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(v1Dir, name), 'utf-8'));
}

function buildItems() {
  const yearly = loadJson('yearly_needs_with_manual_flags.json');
  const monthly = new Map(loadJson('monthly_consumption_table.json').map(i => [i.name, i]));
  const stock = new Map(loadJson('current_stock_table.json').map(i => [i.name, i]));
  const exp = new Map(loadJson('expiration_times_full.json').map(i => [i.name, i]));

  return yearly.map((y, idx) => {
    const m = monthly.get(y.name) || {};
    const s = stock.get(y.name) || {};
    const e = exp.get(y.name) || {};
    const shelfLifeWeeks = e.shelf_life_months != null ? e.shelf_life_months * 4 : null;
    const currentStockByWeek = {};
    if (s.amount != null) currentStockByWeek[0] = s.amount;
    return {
      id: String(idx + 1),
      name: y.name,
      uom: y.home_unit || m.unit || s.unit || '',
      category: y.category || null,
      volumeWeightRatio: 1,
      treatAsWholeUnit: Boolean(y.treat_as_whole_unit),
      shelfLifeWeeks,
      seasonRanges: [],
      currentStockByWeek,
      consumptionPlan: {
        monthly: m.monthly_consumption ?? null,
        yearly: y.total_needed_year ?? null
      },
      version: 1
    };
  });
}

function buildMeals() {
  const types = [
    ['breakfast_meals.json', 'breakfast'],
    ['lunch_dinner_meals.json', 'lunchDinner'],
    ['snack_meals.json', 'snack'],
    ['dessert_meals.json', 'dessert']
  ];
  const meals = [];
  for (const [file, type] of types) {
    const arr = loadJson(file);
    for (const meal of arr) {
      const ingredients = (meal.ingredients || []).map(ing => {
        const { amount, unit } = parseAmount(ing.amount);
        return { name: ing.name, amount, unit };
      });
      meals.push({
        id: String(meals.length + 1),
        name: meal.name,
        type,
        ingredients,
        flags: { prepared: false, prepAhead: false, group: false },
        weight: 1,
        recipeBook: meal.recipeBook || null,
        users: [],
        image: meal.image || null,
        totalCost: null,
        version: 1
      });
    }
  }
  return meals;
}

function buildUsers() {
  return Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    name: `User ${i + 1}`,
    version: 1
  }));
}

function buildUserCategoryDays(users) {
  return users.map(u => ({ userId: u.id, schedule: {}, version: 1 }));
}

function main() {
  const items = buildItems();
  const meals = buildMeals();
  const users = buildUsers();
  const userCategoryDays = buildUserCategoryDays(users);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'items.json'), JSON.stringify(items, null, 2));
  writeFileSync(path.join(outDir, 'meals.json'), JSON.stringify(meals, null, 2));
  writeFileSync(path.join(outDir, 'users.json'), JSON.stringify(users, null, 2));
  writeFileSync(
    path.join(outDir, 'user-category-days.json'),
    JSON.stringify(userCategoryDays, null, 2)
  );
  console.log(
    `Wrote ${items.length} items, ${meals.length} meals, ` +
      `${users.length} users, and ${userCategoryDays.length} user schedules.`
  );
}

main();

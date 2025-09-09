import { get as storageGet, set as storageSet } from '../../src/services/storageService.js';
import { renderItemsWithCategoryHeaders } from './components.js';
import { rebuildCalendars } from '../../src/meal-planner/index.js';

let items = [];
let mealMonthMap = new Map();
let mealYearMap = new Map();
const headerState = {};

export function applyPlanUpdate(item, { monthly, yearly }) {
  item.consumptionPlan = item.consumptionPlan || {};
  if (monthly !== undefined && !isNaN(monthly)) {
    item.consumptionPlan.monthly = monthly;
    item.consumptionPlan.yearly = monthly * 12;
  } else if (yearly !== undefined && !isNaN(yearly)) {
    item.consumptionPlan.yearly = yearly;
    item.consumptionPlan.monthly = yearly / 12;
  }
  return item.consumptionPlan;
}

function render(list) {
  const container = document.getElementById('plans');
  renderItemsWithCategoryHeaders(container, list, (parent, item) => {
    const plan = item.consumptionPlan || {};
    const monthlyUser = plan.monthly || 0;
    const yearlyUser = plan.yearly || 0;
    const mealMonthly = mealMonthMap.get(item.name) || 0;
    const mealYearly = mealYearMap.get(item.name) || 0;

    const div = document.createElement('div');
    div.className = 'item';
    const span = document.createElement('span');
    span.textContent = `${item.name} - ${(monthlyUser + mealMonthly).toFixed(2)}/mo - ${(yearlyUser + mealYearly).toFixed(2)}/yr`;
    div.appendChild(span);

    const mInput = document.createElement('input');
    mInput.type = 'number';
    mInput.placeholder = 'Monthly';
    mInput.value = monthlyUser;

    const yInput = document.createElement('input');
    yInput.type = 'number';
    yInput.placeholder = 'Yearly';
    yInput.value = yearlyUser;

    async function commit(source) {
      if (source === 'monthly') {
        const val = parseFloat(mInput.value);
        if (!isNaN(val)) applyPlanUpdate(item, { monthly: val });
      } else {
        const val = parseFloat(yInput.value);
        if (!isNaN(val)) applyPlanUpdate(item, { yearly: val });
      }
      await storageSet('items', items);
      await rebuildCalendars();
      const { monthly, yearly } = item.consumptionPlan || {};
      span.textContent = `${item.name} - ${(monthly + mealMonthly).toFixed(2)}/mo - ${(yearly + mealYearly).toFixed(2)}/yr`;
      mInput.value = monthly ?? '';
      yInput.value = yearly ?? '';
    }

    mInput.addEventListener('keydown', e => { if (e.key === 'Enter') commit('monthly'); });
    yInput.addEventListener('keydown', e => { if (e.key === 'Enter') commit('yearly'); });

    div.append(document.createTextNode(' '), mInput, document.createTextNode(' '), yInput);
    parent.appendChild(div);
  }, headerState);
}

function applyFilter() {
  const term = document.getElementById('searchBox').value.toLowerCase();
  const list = !term ? items : items.filter(i => i.name.toLowerCase().includes(term));
  render(list);
}

async function init() {
  items = await storageGet('items');
  const meal = await storageGet('meal-plan', {});
  mealMonthMap = new Map((meal.monthly || []).map(m => [m.name, m.monthly || m.monthly_consumption || 0]));
  mealYearMap = new Map((meal.yearly || []).map(m => [m.name, m.yearly || m.total_needed_year || 0]));
  applyFilter();
  document.getElementById('searchBox').addEventListener('input', applyFilter);
}

if (typeof document !== 'undefined') init();

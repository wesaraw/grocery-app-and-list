import { MEAL_TYPES } from './utils/mealData.js';
import { loadJSON } from './utils/dataLoader.js';

const params = new URLSearchParams(location.search);
const cat = params.get('cat') || 'lunchDinner';
const name = params.get('name') || '';

function loadMeals(category) {
  const info = MEAL_TYPES[category] || MEAL_TYPES.lunchDinner;
  return new Promise(async resolve => {
    chrome.storage.local.get(info.key, async data => {
      let arr = data[info.key];
      if (!arr) arr = await loadJSON(info.path);
      if (Array.isArray(arr)) {
        arr.forEach(m => {
          if (!Array.isArray(m.images)) m.images = m.image ? [m.image] : [];
        });
      }
      resolve(arr || []);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const meals = await loadMeals(cat);
  const meal = meals.find(m => (m.name || '') === name);
  if (!meal) {
    document.getElementById('mealName').textContent = 'Meal not found';
    return;
  }
  document.getElementById('mealName').textContent = meal.name;
  const container = document.getElementById('imgContainer');
  const imgs = meal.images && meal.images.length ? meal.images : (meal.image ? [meal.image] : []);
  imgs.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    container.appendChild(img);
  });
});

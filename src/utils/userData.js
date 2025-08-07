import { loadArray, saveArray, loadObject, saveObject } from './itemRegistry.js';

export async function loadUsers() {
  const arr = await loadArray('users');
  if (arr.length) return arr;
  return Array.from({ length: 5 }, (_, i) => `User ${i + 1}`);
}

export async function saveUsers(arr) {
  await saveArray('users', arr);
}

export async function loadUserCategoryDays() {
  const arr = await loadArray('userCategoryDays');
  const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  arr.forEach(rec => {
    Object.keys(rec).forEach(cat => {
      const val = rec[cat];
      if (typeof val === 'number') {
        rec[cat] = weekdays.slice(0, Math.min(7, Math.round(val)));
      }
    });
  });
  return arr;
}

export async function saveUserCategoryDays(arr) {
  await saveArray('userCategoryDays', arr);
}

export async function loadUserPriceThresholds() {
  return loadObject('userPriceThresholds');
}

export async function saveUserPriceThresholds(obj) {
  await saveObject('userPriceThresholds', obj);
}

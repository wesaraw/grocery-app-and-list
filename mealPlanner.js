import { openOrFocusWindow } from './utils/windowUtils.js';

document.getElementById('openLists').addEventListener('click', () => {
  openOrFocusWindow('mealListSelect.html');
});


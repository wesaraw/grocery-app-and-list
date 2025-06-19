import { openOrFocusWindow } from './utils/windowUtils.js';

function openWindow(path) {
  openOrFocusWindow(path);
}

document.getElementById('open-price-checker').addEventListener('click', () => {
  openWindow('popup.html');
});

document.getElementById('open-inventory-timeline').addEventListener('click', () => {
  openWindow('inventoryTimeline.html');
});

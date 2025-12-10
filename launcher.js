// Legacy launcher retained for debugging: the extension badge now opens shell.html.
// Load this file directly only when you need the original window-per-feature flow.
import { openOrFocusWindow } from './utils/windowUtils.js';

function openWindow(path) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    openOrFocusWindow(path);
  } else {
    window.location.href = path;
  }
}

document.getElementById('open-price-checker').addEventListener('click', () => {
  openWindow('priceCheckerNew.html');
});

document.getElementById('open-price-checker-legacy').addEventListener('click', () => {
  openWindow('popup.html');
});

document.getElementById('open-inventory-timeline').addEventListener('click', () => {
  openWindow('inventoryTimeline.html');
});

document.getElementById('open-meal-planner').addEventListener('click', () => {
  openWindow('mealPlanner.html');
});

document.getElementById('open-calendar').addEventListener('click', () => {
  openWindow('whatToEatCalendar.html');
});

document.getElementById('open-pack-count-repair').addEventListener('click', () => {
  openWindow('packCountRepair.html');
});

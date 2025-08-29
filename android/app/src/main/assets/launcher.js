import { openOrFocusWindow } from './utils/windowUtils.js';

function openWindow(path) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    openOrFocusWindow(path);
  } else {
    window.location.href = path;
  }
}

document.getElementById('open-price-checker').addEventListener('click', () => {
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

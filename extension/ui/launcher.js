const openers = {
  priceChecker: 'priceChecker.html',
  inventoryTimeline: 'inventoryTimeline.html',
  mealPlanner: 'mealPlanner.html',
  whatToEatCalendar: 'whatToEatCalendar.html'
};

for (const [id, path] of Object.entries(openers)) {
  const btn = document.getElementById(id);
  if (btn) {
    btn.addEventListener('click', () => {
      window.open(path, '_blank');
    });
  }
}

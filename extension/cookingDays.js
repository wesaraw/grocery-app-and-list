// Migrations for cooking-days data.
// Legacy formats referenced from Version Old/cookingDays.js.
// See "Version 2.0 Upgrade Notes" for background.

const cookingDaysMigrations = {
  0: rec => {
    const categories = {};
    for (const [key, val] of Object.entries(rec || {})) {
      if (key === 'prepDay') continue;
      const label =
        key === 'lunchDinner'
          ? 'Lunch'
          : key.charAt(0).toUpperCase() + key.slice(1);
      categories[label] = Array.isArray(val) ? val : [];
    }
    return {
      categories,
      prepDay: Array.isArray(rec?.prepDay) && rec.prepDay.length ? rec.prepDay[0] : null,
      version: 1,
    };
  },
};

function runCookingDaysMigrations(rec) {
  let current = { ...rec };
  let v = current.version ?? 0;
  while (cookingDaysMigrations[v]) {
    current = cookingDaysMigrations[v](current);
    v = current.version ?? v + 1;
  }
  return current;
}

export { cookingDaysMigrations, runCookingDaysMigrations };
//# sourceMappingURL=cookingDays.js.map

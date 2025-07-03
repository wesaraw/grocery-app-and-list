export function generatePreparedMealsCalendar(cookingDays, mealsByCategory, startDate, weeks = 4) {
  const calendar = {};
  const mealIndices = {};
  const date = new Date(startDate);
  for (let i = 0; i < weeks * 7; i++) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = date.toISOString().split('T')[0];
    if (!calendar[dateStr]) calendar[dateStr] = {};
    Object.entries(cookingDays).forEach(([category, days]) => {
      if (days.includes(dayName)) {
        const meals = (mealsByCategory[category] || []).filter(m => m.prepared);
        if (meals.length) {
          const idx = mealIndices[category] || 0;
          const meal = meals[idx % meals.length];
          calendar[dateStr][category] = meal.id || meal.name || String(idx);
          mealIndices[category] = idx + 1;
        }
      }
    });
    date.setDate(date.getDate() + 1);
  }
  return calendar;
}

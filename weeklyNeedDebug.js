document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const item = params.get('item') || '';
  const base = parseFloat(params.get('base') || '0');
  const meal = parseFloat(params.get('meal') || '0');
  const wpm = parseFloat(params.get('wpm') || '4.33');
  const weekly = parseFloat(params.get('weekly') || ((base + meal) / wpm));
  const lines = [
    `${base.toFixed(2)} (base monthly consumption)`,
    `${meal.toFixed(2)} (meal plan monthly consumption)`,
    `${(base + meal).toFixed(2)} (combined monthly consumption)`,
    `${wpm.toFixed(2)} (weeks per month)`,
    `${weekly.toFixed(2)} (weekly need)`
  ];
  document.getElementById('item').textContent = item;
  document.getElementById('info').textContent = lines.join('\n');
});

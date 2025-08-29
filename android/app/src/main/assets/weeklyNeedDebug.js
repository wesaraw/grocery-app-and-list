function canonicalName(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function loadBreakdown(key) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('mealPlanMonthlyBreakdown', data => {
        resolve((data.mealPlanMonthlyBreakdown || {})[key] || {});
      });
    } catch (e) {
      resolve({});
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const item = params.get('item') || '';
  const key = canonicalName(item);
  const base = parseFloat(params.get('base') || '0');
  const meal = parseFloat(params.get('meal') || '0');
  const wpm = parseFloat(params.get('wpm') || '4.33');
  const weekly = parseFloat(params.get('weekly') || (base + meal) / wpm);
  const breakdown = await loadBreakdown(key);
  const lines = [
    `${base.toFixed(2)} (base monthly consumption)`,
    `${meal.toFixed(2)} (meal plan monthly consumption)`
  ];
  Object.keys(breakdown).forEach(m => {
    const entry = breakdown[m];
    const amount = typeof entry === 'number' ? entry : entry.amount;
    lines.push(`  - ${m}: ${amount.toFixed(2)}`);
    if (entry && entry.details) {
      const A = entry.details.perDay;
      const factors = (entry.details.factors || [])
        .map(f => `(${f.people} * ${f.days})`)
        .join(' + ');
      lines.push(`    ${A} * (${factors}) * 52 / 12`);
    }
  });
  lines.push(
    `${(base + meal).toFixed(2)} (combined monthly consumption)`,
    `${wpm.toFixed(2)} (weeks per month)`,
    `${weekly.toFixed(2)} (weekly need)`
  );
  document.getElementById('item').textContent = item;
  document.getElementById('info').textContent = lines.join('\n');
});

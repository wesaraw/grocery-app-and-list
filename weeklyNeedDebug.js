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
      const perDay = entry.details.perDay;
      const active = entry.details.activeMeals || 1;
      const factors = entry.details.factors || [];
      const factorExpr = factors
        .map(f => `(${f.people} * ${f.days})`)
        .join(' + ');
      const factorVal = factors.reduce((sum, f) => sum + f.people * f.days, 0);
      const spots = (perDay * factorVal * 52) / active / 12;
      const serving = spots ? amount / spots : 0;
      lines.push(
        `    spots: ${perDay} * (${factorExpr}) * 52 / ${active} / 12 = ${spots.toFixed(
          2
        )}`
      );
      lines.push(
        `    need: ${spots.toFixed(2)} * ${serving.toFixed(2)} = ${amount.toFixed(2)}`
      );
    }
  });
  lines.push(
    `${(base + meal).toFixed(2)} (combined monthly consumption)`,
    `${(base + meal).toFixed(2)} / ${wpm.toFixed(2)} = ${weekly.toFixed(
      2
    )} per week`
  );
  document.getElementById('item').textContent = item;
  document.getElementById('info').textContent = lines.join('\n');
});

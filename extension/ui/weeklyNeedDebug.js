const DEFAULT_WPM = 4.33;

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const name = params.get('item') || '';
  const weekly = parseFloat(params.get('weekly') || '0');
  const wpm = parseFloat(params.get('wpm') || String(DEFAULT_WPM));
  const monthly = weekly * wpm;
  const yearly = weekly * 52;

  document.getElementById('item').textContent = name;
  document.getElementById('monthly').textContent = monthly.toFixed(2);
  document.getElementById('yearly').textContent = yearly.toFixed(2);
  document.getElementById('weekly').textContent = weekly.toFixed(2);
});

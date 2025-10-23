const DECIMAL_PLACES = 2;

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return Number.isFinite(value) ? value : NaN;
}

export function roundQuantity(value, precision = DECIMAL_PLACES) {
  if (value == null) return value;
  const num = toNumber(value);
  if (!Number.isFinite(num)) return value;
  const places = typeof precision === 'number' && Number.isFinite(precision) ? precision : DECIMAL_PLACES;
  const factor = Math.pow(10, Math.max(0, Math.trunc(places)));
  return Math.round(num * factor) / factor;
}

export function formatQuantity(value) {
  if (value == null || value === '') return '';
  const rounded = roundQuantity(value);
  if (!Number.isFinite(rounded)) {
    return typeof value === 'string' ? value : String(value);
  }
  const tenth = Math.round(rounded * 10) / 10;
  if (Object.is(tenth, -0)) return '0';
  if (Number.isInteger(tenth)) {
    return String(tenth);
  }
  return tenth.toFixed(1).replace(/\.0$/, '');
}

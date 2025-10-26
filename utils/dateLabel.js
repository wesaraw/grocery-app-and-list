const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function defaultFormatter(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function toLocalDateFromIso(input) {
  if (!input) return null;

  if (input instanceof Date) {
    const time = input.getTime();
    return Number.isNaN(time) ? null : new Date(time);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    const match = ISO_DATE_ONLY.exec(trimmed);
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      const day = Number(match[3]);
      const date = new Date(year, monthIndex, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateLabel(iso, formatter = defaultFormatter) {
  const date = toLocalDateFromIso(iso);
  if (!date) return null;
  return formatter(date);
}

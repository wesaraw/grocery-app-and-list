import { loadObject, saveObject } from './itemRegistry.js';

export async function loadItemSeasons() {
  return loadObject('itemSeasons');
}

export async function saveItemSeasons(map) {
  await saveObject('itemSeasons', map);
}

function parseMonth(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d)) return d.getMonth() + 1;
    return null;
  }
  const m = parseInt(str, 10);
  if (isNaN(m) || m < 1 || m > 12) return null;
  return m;
}

export function isItemInSeason(seasons, name, date = new Date()) {
  const ranges = seasons?.[name];
  if (!Array.isArray(ranges) || !ranges.length) return true;
  const val = date.getMonth() + 1;
  return ranges.some(r => {
    const s = parseMonth(r.start);
    const e = parseMonth(r.end);
    if (s == null || e == null) return false;
    if (s <= e) return val >= s && val <= e;
    return val >= s || val <= e;
  });
}

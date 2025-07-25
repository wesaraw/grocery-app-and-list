export function loadItemSeasons() {
  return new Promise(resolve => {
    chrome.storage.local.get('itemSeasons', data => {
      resolve(data.itemSeasons || {});
    });
  });
}

export function saveItemSeasons(map) {
  return new Promise(resolve => {
    chrome.storage.local.set({ itemSeasons: map }, () => resolve());
  });
}

function parseMD(str) {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const d = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(d)) return null;
  return m * 100 + d;
}

export function isItemInSeason(seasons, name, date = new Date()) {
  const ranges = seasons?.[name];
  if (!Array.isArray(ranges) || !ranges.length) return true;
  const val = (date.getMonth() + 1) * 100 + date.getDate();
  return ranges.some(r => {
    const s = parseMD(r.start);
    const e = parseMD(r.end);
    if (s == null || e == null) return false;
    if (s <= e) return val >= s && val <= e;
    return val >= s || val <= e;
  });
}

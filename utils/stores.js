export const STORE_IDS = {
  'Stop & Shop': 'ss',
  Walmart: 'wm',
  Amazon: 'am',
  Shaws: 'sh',
  'Roche Bros': 'rb',
  Hannaford: 'ha'
};

export const STORE_NAMES = Object.fromEntries(
  Object.entries(STORE_IDS).map(([name, id]) => [id, name])
);

export function getStoreId(name) {
  return STORE_IDS[name] || name;
}

export function getStoreName(id) {
  return STORE_NAMES[id] || id;
}


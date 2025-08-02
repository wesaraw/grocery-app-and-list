export function loadItems() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get('items', data => {
        const map = data.items || {};
        Object.entries(map).forEach(([id, val]) => {
          if (typeof val === 'string') {
            map[id] = { name: val };
          }
        });
        resolve(map);
      });
    } catch (e) {
      resolve({});
    }
  });
}

export function saveItems(map) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.set({ items: map }, () => resolve());
    } catch (e) {
      resolve();
    }
  });
}

export function generateItemId() {
  return (
    'i' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

export function getItemName(items, id) {
  return items[id]?.name || id;
}

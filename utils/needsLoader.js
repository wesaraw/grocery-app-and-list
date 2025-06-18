import { loadJSON } from './dataLoader.js';

export async function loadNeedsWithDefaults() {
  const PATH = 'Required for grocery app/yearly_needs_with_manual_flags.json';
  const defaults = await loadJSON(PATH);
  return new Promise(resolve => {
    chrome.storage.local.get('yearlyNeeds', data => {
      const stored = data.yearlyNeeds || [];
      const map = new Map(stored.map(it => [it.name, { ...it }]));
      let updated = false;
      defaults.forEach(def => {
        const existing = map.get(def.name);
        if (!existing) {
          map.set(def.name, { ...def });
          updated = true;
        } else if (!existing.category && def.category) {
          existing.category = def.category;
          map.set(def.name, existing);
          updated = true;
        }
      });
      const merged = Array.from(map.values());
      if (updated) {
        chrome.storage.local.set({ yearlyNeeds: merged }, () => resolve(merged));
      } else {
        resolve(merged);
      }
    });
  });
}

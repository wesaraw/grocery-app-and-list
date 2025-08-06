import { migrateItemRegistry } from './utils/itemRegistry.js';
import { migrateItemDetails } from './utils/itemDetails.js';
import { migrateSearchResults } from './utils/searchResults.js';

async function exportData() {
  await migrateItemRegistry();
  await migrateItemDetails();
  await migrateSearchResults();
  chrome.storage.local.get(null, data => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grocery_backup.txt';
    a.click();
    URL.revokeObjectURL(url);
  });
}

function importFromText(text) {
  try {
    const data = JSON.parse(text);
    chrome.storage.local.set(data, async () => {
      await migrateItemRegistry();
      await migrateItemDetails();
      await migrateSearchResults();
      alert('Import complete');
    });
  } catch (e) {
    alert('Invalid file');
  }
}

function triggerImport() {
  document.getElementById('importFile').click();
}

document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', triggerImport);

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => importFromText(reader.result);
  reader.readAsText(file);
});

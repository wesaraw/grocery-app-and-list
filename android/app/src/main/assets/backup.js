const STORE_SELECTION_KEY = 'storeSelections';
const SCRAPED_PREFIX = 'scraped_';

function stripEphemeralKeys(data = {}) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  if (Object.prototype.hasOwnProperty.call(data, STORE_SELECTION_KEY)) {
    delete data[STORE_SELECTION_KEY];
  }
  Object.keys(data).forEach(key => {
    if (key.startsWith(SCRAPED_PREFIX)) {
      delete data[key];
    }
  });
  return data;
}

function exportData() {
  chrome.storage.local.get(null, data => {
    const json = JSON.stringify(stripEphemeralKeys({ ...(data || {}) }), null, 2);
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
    const data = stripEphemeralKeys(JSON.parse(text));
    chrome.storage.local.set(data, () => {
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

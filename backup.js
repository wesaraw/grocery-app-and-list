import { exportAll, importAll } from './db.js';

const status = document.getElementById('status');

async function exportData() {
  const json = await exportAll();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'grocery_backup.json';
  a.click();
  URL.revokeObjectURL(url);
  if (status) {
    status.textContent = 'Export complete';
  }
}

async function importFromText(text) {
  try {
    await importAll(text);
    if (status) {
      status.textContent = 'Import complete';
    }
  } catch (e) {
    if (status) {
      status.textContent = `Import failed: ${e.message}`;
    }
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

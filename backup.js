import { exportAll, importAll } from './db.js';
async function exportData() {
  const json = await exportAll();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'grocery_backup.txt';
  a.click();
  URL.revokeObjectURL(url);
}

async function importFromText(text) {
  try {
    await importAll(text);
    alert('Import complete');
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

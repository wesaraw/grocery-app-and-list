import { saveBackup, loadBackup } from '../../src/services/backup.ts';

document.getElementById('exportBtn')?.addEventListener('click', async () => {
  const blob = await saveBackup();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'grocery_backup_v2.json';
  a.click();
  URL.revokeObjectURL(url);
});

const fileInput = document.getElementById('importFile');

document.getElementById('importBtn')?.addEventListener('click', () => {
  fileInput?.click();
});

fileInput?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await loadBackup(file);
    alert('Import complete');
  } catch (err) {
    alert('Invalid backup: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

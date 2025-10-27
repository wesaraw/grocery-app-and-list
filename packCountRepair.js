import { repairFinalProducts } from './utils/packCountRepair.js';

function getAllStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(null, data => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(data || {});
      }
    });
  });
}

function setStorage(updates) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(updates, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

const statusEl = document.getElementById('status');
const detailsEl = document.getElementById('details');
const runButton = document.getElementById('repair-button');

function logDetails(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    detailsEl.textContent = '';
    return;
  }
  detailsEl.textContent = lines.join('\n');
}

function formatEntry(entry, index) {
  const prefix = `${index + 1}. ${entry.name || entry.key}`;
  const before = entry.sizeBefore != null ? `before: ${entry.sizeBefore}` : 'before: (missing)';
  const after = entry.sizeAfter != null ? `after: ${entry.sizeAfter}` : 'after: (missing)';
  const reason = entry.reason ? `reason: ${entry.reason}` : '';
  return [prefix, before, after, reason].filter(Boolean).join(' | ');
}

async function runRepair() {
  statusEl.textContent = 'Scanning saved products…';
  detailsEl.textContent = '';
  runButton.disabled = true;

  try {
    const allData = await getAllStorage();
    const { updates, summary } = repairFinalProducts(allData);

    if (summary.length === 0) {
      statusEl.textContent = 'No inflated pack weights found.';
      return;
    }

    statusEl.textContent = `Updating ${summary.length} product${summary.length === 1 ? '' : 's'}…`;
    await setStorage(updates);

    statusEl.textContent = `Updated ${summary.length} product${summary.length === 1 ? '' : 's'}.`;
    logDetails(summary.map(formatEntry));
  } catch (err) {
    console.error('Pack count repair failed', err);
    statusEl.textContent = 'Repair failed. See console for details.';
  } finally {
    runButton.disabled = false;
  }
}

runButton.addEventListener('click', runRepair);

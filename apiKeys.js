import { getFdcApiKey, setFdcApiKey } from './utils/apiKeyStorage.js';

function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.className = `status ${type}`.trim();
}

function notifyKeyUpdate() {
  if (!chrome?.runtime?.sendMessage) return;
  try {
    chrome.runtime.sendMessage({ type: 'fdc-api-key-updated' }, () => {
      const runtimeError = chrome.runtime?.lastError;
      if (runtimeError) {
        console.debug('FDC API key update broadcast error', runtimeError);
      }
    });
  } catch (error) {
    console.debug('Unable to broadcast FDC API key update', error);
  }
}

async function loadKey() {
  const input = document.getElementById('fdcKey');
  if (!input) return;

  try {
    const key = await getFdcApiKey();
    input.value = key || '';
    if (!key) {
      showStatus('Enter your USDA FoodData Central API key to enable nutrition lookups.', 'info');
    } else {
      showStatus('An API key is stored.', 'success');
    }
  } catch (error) {
    console.error('Failed to load FDC API key', error);
    showStatus('Unable to read stored key. Try again or enter a new one.', 'error');
  }
}

async function saveKey() {
  const input = document.getElementById('fdcKey');
  if (!input) return;

  const key = (input.value || '').trim();
  try {
    await setFdcApiKey(key);
    showStatus('Saved successfully.', 'success');
    notifyKeyUpdate();
  } catch (error) {
    console.error('Failed to save API key', error);
    const message = error?.message ? `Unable to save key: ${error.message}` : 'Unable to save key. See console for details.';
    showStatus(message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadKey();
  const saveBtn = document.getElementById('saveBtn');
  const closeBtn = document.getElementById('closeBtn');
  const input = document.getElementById('fdcKey');

  saveBtn?.addEventListener('click', saveKey);
  closeBtn?.addEventListener('click', () => window.close());
  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveKey();
    }
  });
});

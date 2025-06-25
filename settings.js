const KEY = 'planEntryMode';

function loadMode() {
  return new Promise(resolve => {
    chrome.storage.local.get([KEY], data => {
      resolve(data[KEY] || 'yearly');
    });
  });
}

function saveMode(mode) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [KEY]: mode }, () => resolve());
  });
}

function updateButton(btn, mode) {
  btn.textContent = `Consumption Plan: ${mode === 'monthly' ? 'Monthly Need' : 'Yearly Need'}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const btn = document.getElementById('togglePlan');
  let mode = await loadMode();
  updateButton(btn, mode);
  btn.addEventListener('click', async () => {
    mode = mode === 'monthly' ? 'yearly' : 'monthly';
    await saveMode(mode);
    updateButton(btn, mode);
  });
});

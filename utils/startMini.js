export function setupStartMiniButton(key) {
  return new Promise(resolve => {
    const btn = document.getElementById('startMini');
    if (!btn) {
      resolve(true);
      return;
    }
    try {
      chrome.storage.local.get(key, data => {
        let startMini = data[key];
        if (startMini === undefined) startMini = true;
        btn.textContent = startMini ? 'Start Mini: On' : 'Start Mini: Off';
        btn.addEventListener('click', () => {
          startMini = !startMini;
          chrome.storage.local.set({ [key]: startMini });
          btn.textContent = startMini ? 'Start Mini: On' : 'Start Mini: Off';
        });
        resolve(startMini);
      });
    } catch (e) {
      resolve(true);
    }
  });
}

const STORAGE_KEY = 'fdcApiKey';

function getChromeStorage() {
  return typeof chrome !== 'undefined' ? chrome.storage : undefined;
}

function getChromeRuntime() {
  return typeof chrome !== 'undefined' ? chrome.runtime : undefined;
}

export function getFdcApiKey() {
  return new Promise((resolve, reject) => {
    try {
      const storage = getChromeStorage();
      if (!storage?.local?.get) {
        resolve('');
        return;
      }

      storage.local.get(STORAGE_KEY, data => {
        const runtimeError = getChromeRuntime()?.lastError;
        if (runtimeError) {
          reject(runtimeError);
          return;
        }
        resolve(data?.[STORAGE_KEY] || '');
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function setFdcApiKey(value) {
  return new Promise((resolve, reject) => {
    try {
      const storage = getChromeStorage();
      if (!storage?.local?.set) {
        reject(new Error('Chrome storage unavailable'));
        return;
      }

      storage.local.set({ [STORAGE_KEY]: value || '' }, () => {
        const runtimeError = getChromeRuntime()?.lastError;
        if (runtimeError) {
          reject(runtimeError);
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

export function onFdcApiKeyChanged(callback) {
  const storage = getChromeStorage();
  if (!storage?.onChanged || typeof callback !== 'function') return () => {};

  const handler = (changes, area) => {
    if (area !== 'local') return;
    if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
      callback(changes[STORAGE_KEY].newValue || '', changes[STORAGE_KEY].oldValue || '');
    }
  };

  try {
    storage.onChanged.addListener(handler);
  } catch (error) {
    console.error('Unable to attach API key storage listener', error);
    return () => {};
  }

  return () => {
    try {
      storage.onChanged.removeListener(handler);
    } catch (_) {
      // ignore
    }
  };
}

export { STORAGE_KEY as FDC_API_KEY_STORAGE_KEY };

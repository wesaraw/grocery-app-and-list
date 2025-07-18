(function () {
  if (typeof chrome === 'undefined') {
    window.chrome = {};
  }
  if (!chrome.storage) {
    chrome.storage = {};
  }
  if (!chrome.runtime) {
    chrome.runtime = {};
  }
  if (!chrome.tabs) {
    chrome.tabs = {};
  }
  if (!chrome.windows) {
    chrome.windows = {};
  }

  const callGet = key => {
    const result = StorageBridge.getItem(key);
    try {
      return result ? JSON.parse(result) : null;
    } catch (e) {
      return result;
    }
  };

  const storageChangeListeners = [];

  const emitChanges = changes => {
    if (!changes || Object.keys(changes).length === 0) return;
    storageChangeListeners.forEach(fn => {
      try {
        fn(changes, 'local');
      } catch (_) {}
    });
  };

  chrome.storage.onChanged = {
    addListener: fn => storageChangeListeners.push(fn)
  };

  chrome.storage.local = {
    get: function (key, callback) {
      const keys = Array.isArray(key) ? key : [key];
      const obj = {};
      keys.forEach(k => {
        if (k == null) return; // skip null
        obj[k] = callGet(k);
      });
      if (key === null) {
        // No API to get all, so return empty object
      }
      callback(obj);
    },
    set: function (items, callback) {
      const changes = {};
      for (const k in items) {
        const oldValue = callGet(k);
        const newValue = items[k];
        const val = JSON.stringify(newValue);
        StorageBridge.setItem(k, val);
        changes[k] = { oldValue, newValue };
      }
      emitChanges(changes);
      if (callback) callback();
    },
    remove: function (keys, callback) {
      if (!Array.isArray(keys)) keys = [keys];
      const changes = {};
      keys.forEach(k => {
        const oldValue = callGet(k);
        StorageBridge.setItem(k, null);
        changes[k] = { oldValue, newValue: undefined };
      });
      emitChanges(changes);
      if (callback) callback();
    }
  };

  chrome.runtime.getURL = path => `file:///android_asset/${path}`;

  const runtimeListeners = [];
  chrome.runtime.onMessage = {
    addListener: function (fn) {
      runtimeListeners.push(fn);
    }
  };

  chrome.runtime.sendMessage = function (msg, callback) {
    if (window.RuntimeBridge && RuntimeBridge.sendMessage) {
      const result = RuntimeBridge.sendMessage(JSON.stringify(msg));
      if (callback) {
        callback(result ? JSON.parse(result) : undefined);
      }
    }
  };

  window.__handleNativeMessage = function (json) {
    try {
      const msg = JSON.parse(json);
      runtimeListeners.forEach(fn => fn(msg, null, function () {}));
    } catch (_) {}
  };

  chrome.tabs.sendMessage = function (tabId, msg) {
    if (window.RuntimeBridge && RuntimeBridge.tabsSendMessage) {
      RuntimeBridge.tabsSendMessage(tabId, JSON.stringify(msg));
    }
  };

  chrome.windows.create = function (opts) {
    if (window.RuntimeBridge && RuntimeBridge.createWindow) {
      RuntimeBridge.createWindow(opts.url);
    }
  };
})();

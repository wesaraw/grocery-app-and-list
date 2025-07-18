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
      for (const k in items) {
        const val = JSON.stringify(items[k]);
        StorageBridge.setItem(k, val);
      }
      if (callback) callback();
    },
    remove: function (keys, callback) {
      if (!Array.isArray(keys)) keys = [keys];
      keys.forEach(k => StorageBridge.setItem(k, null));
      if (callback) callback();
    }
  };

  chrome.runtime.getURL = function (path) {
    return 'file:///android_asset/' + path;
  };

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

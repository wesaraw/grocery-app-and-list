(function () {
  if (typeof chrome === 'undefined') {
    window.chrome = {};
  }
  if (!chrome.storage) {
    chrome.storage = {};
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

  if (!chrome.runtime) {
    chrome.runtime = {};
  }
  const pending = {};
  chrome.runtime.sendMessage = function (msg, callback) {
    const id = 'cb_' + Math.random().toString(36).slice(2);
    if (callback) pending[id] = callback;
    const payload = Object.assign({}, msg, { callbackId: id });
    RuntimeBridge.sendMessage(msg.type, JSON.stringify(payload));
    return new Promise(resolve => {
      if (!callback) pending[id] = resolve;
      else {
        const orig = pending[id];
        pending[id] = res => { orig(res); resolve(res); };
      }
    });
  };

  window.__runtimeCallback = function (id, json) {
    const cb = pending[id];
    if (cb) {
      let data;
      try {
        data = JSON.parse(json);
      } catch (_) {
        data = json;
      }
      cb(data);
      delete pending[id];
    }
  };
})();

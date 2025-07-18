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
})();

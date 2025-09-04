export function loadUsers() {
  return new Promise(resolve => {
    chrome.storage.local.get('users', data => {
      if (Array.isArray(data.users) && data.users.length) {
        resolve(data.users);
      } else {
        const defaultUsers = Array.from({ length: 5 }, (_, i) => `User ${i + 1}`);
        resolve(defaultUsers);
      }
    });
  });
}

export function saveUsers(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ users: arr }, () => resolve());
  });
}

export function loadUserCategoryDays() {
  return new Promise(resolve => {
    chrome.storage.local.get('userCategoryDays', data => {
      const arr = Array.isArray(data.userCategoryDays) ? data.userCategoryDays : [];
      const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      arr.forEach(rec => {
        Object.keys(rec).forEach(cat => {
          const val = rec[cat];
          if (typeof val === 'number') {
            rec[cat] = weekdays.slice(0, Math.min(7, Math.round(val)));
          }
        });
      });
      resolve(arr);
    });
  });
}

export function saveUserCategoryDays(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ userCategoryDays: arr }, () => resolve());
  });
}

export function loadUserPriceThresholds() {
  return new Promise(resolve => {
    chrome.storage.local.get('userPriceThresholds', data => {
      resolve(data.userPriceThresholds || {});
    });
  });
}

export function saveUserPriceThresholds(obj) {
  return new Promise(resolve => {
    chrome.storage.local.set({ userPriceThresholds: obj }, () => resolve());
  });
}

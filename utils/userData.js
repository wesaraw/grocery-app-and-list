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
      if (Array.isArray(data.userCategoryDays)) {
        resolve(data.userCategoryDays);
      } else {
        resolve([]);
      }
    });
  });
}

export function saveUserCategoryDays(arr) {
  return new Promise(resolve => {
    chrome.storage.local.set({ userCategoryDays: arr }, () => resolve());
  });
}

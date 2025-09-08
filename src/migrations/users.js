// Migrations for user-related data.
// Legacy formats referenced from Version Old/users.js.
// See "Version 2.0 Upgrade Notes" for background.

export const userMigrations = {
  0: (user, idx) => ({
    id: user.id || String(idx),
    name: typeof user === 'string' ? user : user.name || `User ${idx + 1}`,
    version: 1,
  }),
};

export function runUserMigrations(user, idx) {
  let current = typeof user === 'string' ? { name: user } : { ...user };
  let v = current.version ?? 0;
  while (userMigrations[v]) {
    current = userMigrations[v](current, idx);
    v = current.version ?? v + 1;
  }
  return current;
}

export const userCategoryDaysMigrations = {
  0: (rec, idx) => ({
    userId: rec.userId || String(idx),
    schedule: rec.schedule || rec || {},
    version: 1,
  }),
};

export function runUserCategoryDaysMigrations(rec, idx) {
  let current = { ...rec };
  let v = current.version ?? 0;
  while (userCategoryDaysMigrations[v]) {
    current = userCategoryDaysMigrations[v](current, idx);
    v = current.version ?? v + 1;
  }
  return current;
}

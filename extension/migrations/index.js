function v1ToV2(item) {
    // Example migration: ensure density defaults to 1
    return { ...item, density: item.density ?? 1, version: 2 };
}
const migrations = {
    1: v1ToV2,
};
function runMigrations(entity) {
    let current = { ...entity };
    while (migrations[current.version]) {
        current = migrations[current.version](current);
    }
    return current;
}

export { migrations, runMigrations, v1ToV2 };
//# sourceMappingURL=index.js.map

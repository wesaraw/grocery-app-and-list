export function normalizeName(name) {
  return (name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

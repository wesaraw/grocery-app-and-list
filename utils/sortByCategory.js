export function sortItemsByCategory(arr) {
  return arr.slice().sort((a, b) => {
    const catA = (a.category || '').toLowerCase();
    const catB = (b.category || '').toLowerCase();
    if (catA === catB) {
      return a.name.localeCompare(b.name);
    }
    return catA.localeCompare(catB);
  });
}

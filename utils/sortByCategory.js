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

export function renderItemsWithCategoryHeaders(items, container, renderFn) {
  let lastCat = null;
  items.forEach(item => {
    const cat = item.category || 'Other';
    if (cat !== lastCat) {
      lastCat = cat;
      const header = document.createElement('h3');
      header.className = 'category-header';
      header.textContent = cat;
      container.appendChild(header);
    }
    const node = renderFn(item);
    if (node) container.appendChild(node);
  });
}

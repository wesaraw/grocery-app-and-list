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
  let header = null;
  let nodes = [];

  function finalizeHeader() {
    if (!header) return;
    const curHeader = header;
    const curNodes = [...nodes];
    curHeader.dataset.hidden = 'true';
    curNodes.forEach(n => {
      n.style.display = 'none';
    });
    curHeader.style.cursor = 'pointer';
    curHeader.addEventListener('click', () => {
      const hidden = curHeader.dataset.hidden === 'true';
      curHeader.dataset.hidden = hidden ? 'false' : 'true';
      curNodes.forEach(n => {
        n.style.display = hidden ? '' : 'none';
      });
    });
  }

  items.forEach(item => {
    const cat = item.category || 'Other';
    if (cat !== lastCat) {
      finalizeHeader();
      lastCat = cat;
      header = document.createElement('h3');
      header.className = 'category-header';
      header.textContent = cat;
      nodes = [];
      container.appendChild(header);
    }
    const node = renderFn(item);
    if (node) {
      nodes.push(node);
      container.appendChild(node);
    }
  });
  finalizeHeader();
}

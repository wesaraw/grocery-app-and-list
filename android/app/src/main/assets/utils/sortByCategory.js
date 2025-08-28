export function sortItemsByCategory(arr) {
  return arr.slice().sort((a, b) => {
    const catA = (a.category || 'Missing').toLowerCase();
    const catB = (b.category || 'Missing').toLowerCase();
    const nameA = a.name || '';
    const nameB = b.name || '';
    if (catA === catB) {
      return nameA.localeCompare(nameB);
    }
    return catA.localeCompare(catB);
  });
}

export function renderItemsWithCategoryHeaders(
  items,
  container,
  renderFn,
  headerState = {},
  defaultHidden = true
) {
  let lastCat = null;
  let header = null;
  let nodes = [];

  function finalizeHeader(cat, hdr, nodesForHeader) {
    if (!hdr) return;
    const hidden =
      headerState[cat] !== undefined ? headerState[cat] : defaultHidden;
    hdr.dataset.hidden = hidden ? 'true' : 'false';
    nodesForHeader.forEach(n => {
      n.style.display = hidden ? 'none' : '';
    });
    hdr.style.cursor = 'pointer';
    hdr.addEventListener('click', () => {
      const isHidden = hdr.dataset.hidden === 'true';
      hdr.dataset.hidden = isHidden ? 'false' : 'true';
      nodesForHeader.forEach(n => {
        n.style.display = isHidden ? '' : 'none';
      });
      headerState[cat] = !isHidden;
    });
  }

  items.forEach(item => {
    const cat = item.category || 'Missing';
    if (cat !== lastCat) {
      finalizeHeader(lastCat, header, nodes);
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
  finalizeHeader(lastCat, header, nodes);
}

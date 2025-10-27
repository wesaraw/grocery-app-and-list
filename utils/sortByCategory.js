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

export function renderItemsWithCategoryHeaders(
  items,
  container,
  renderFn,
  headerState = {},
  options = {}
) {
  let lastCat = null;
  let header = null;
  let nodes = [];

  const { decorateHeader } = options || {};

  function getInitialHiddenValue(cat) {
    return headerState[cat] !== undefined ? headerState[cat] : true;
  }

  function applyHiddenState(hdr, nodesForHeader, hidden) {
    if (!hdr) {
      return;
    }
    hdr.dataset.hidden = hidden ? 'true' : 'false';
    nodesForHeader.forEach(n => {
      n.style.display = hidden ? 'none' : '';
    });
  }

  function finalizeHeader(cat, hdr, nodesForHeader) {
    if (!hdr) return;
    const hidden = getInitialHiddenValue(cat);
    applyHiddenState(hdr, nodesForHeader, hidden);
    hdr.style.cursor = 'pointer';
    hdr.addEventListener('click', event => {
      if (event.defaultPrevented) {
        return;
      }
      const isHidden = hdr.dataset.hidden === 'true';
      const nextHidden = !isHidden;
      applyHiddenState(hdr, nodesForHeader, nextHidden);
      headerState[cat] = nextHidden;
    });
  }

  items.forEach(item => {
    const cat = item.category || 'Other';
    if (cat !== lastCat) {
      finalizeHeader(lastCat, header, nodes);
      lastCat = cat;
      header = document.createElement('h3');
      header.className = 'category-header';
      header.textContent = '';
      const label = document.createElement('span');
      label.className = 'category-header-label';
      label.textContent = cat;
      header.appendChild(label);

      nodes = [];

      const initialHidden = getInitialHiddenValue(cat);
      applyHiddenState(header, nodes, initialHidden);

      if (typeof decorateHeader === 'function') {
        const toggleState = {
          get hidden() {
            return getInitialHiddenValue(cat);
          },
          set hidden(value) {
            const normalized = !!value;
            headerState[cat] = normalized;
            applyHiddenState(header, nodes, normalized);
          },
          setHidden(value) {
            const normalized = !!value;
            headerState[cat] = normalized;
            applyHiddenState(header, nodes, normalized);
          },
        };

        decorateHeader(header, cat, toggleState);
      }

      container.appendChild(header);
    }
    const node = renderFn(item);
    if (node) {
      nodes.push(node);
      container.appendChild(node);
      if (header && header.dataset.hidden === 'true') {
        node.style.display = 'none';
      }
    }
  });
  finalizeHeader(lastCat, header, nodes);
}

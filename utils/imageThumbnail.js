export function resolveItemImage(item, fallbackImage = null) {
  if (!item) return fallbackImage;
  return item.productImage || item.finalProduct?.image || item.image || fallbackImage || null;
}

export function applyImageThumb(container, imageUrl, label, fallbackIcon = '🛒') {
  if (!container) return;
  const fallback = container.querySelector('.image-thumb__fallback');
  const displayLabel = (label || fallbackIcon).toString().trim();

  if (imageUrl) {
    container.style.backgroundImage = `url("${imageUrl}")`;
    container.classList.add('has-image');
    if (fallback) fallback.textContent = displayLabel.charAt(0).toUpperCase();
  } else {
    container.style.removeProperty('background-image');
    container.classList.remove('has-image');
    if (fallback) fallback.textContent = displayLabel.charAt(0).toUpperCase();
  }
}

export function resolveItemImage(item, fallbackImage = null) {
  if (!item) return fallbackImage;
  return item.productImage || item.finalProduct?.image || item.image || fallbackImage || null;
}

export function applyImageThumb(container, imageUrl, label, fallbackIcon = '🛒') {
  if (!container) return;

  const fallback =
    container.querySelector('.image-thumb__fallback') ||
    container.querySelector('.category-card__placeholder');
  const displayLabel = (label || fallbackIcon).toString().trim();

  let img = container.querySelector('img');
  if (imageUrl) {
    if (!img) {
      img = document.createElement('img');
      img.alt = displayLabel ? `${displayLabel} image` : 'Item image';
      container.prepend(img);
    }
    img.src = imageUrl;
    container.classList.add('has-image');
    if (fallback) fallback.textContent = displayLabel.charAt(0).toUpperCase();
  } else {
    if (img && img.parentElement === container) {
      container.removeChild(img);
    }
    container.classList.remove('has-image');
    if (fallback) fallback.textContent = displayLabel.charAt(0).toUpperCase();
  }
}

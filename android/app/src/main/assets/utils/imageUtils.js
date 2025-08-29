export function getImageSrc(el) {
  if (!el) return '';
  const attrs = [
    'src',
    'data-src',
    'data-original',
    'data-image-src',
    'data-lazy',
    'data-lazy-src'
  ];
  for (const attr of attrs) {
    const val = el.getAttribute && el.getAttribute(attr);
    if (val) {
      try {
        return new URL(val, location.href).href;
      } catch (_) {
        return val;
      }
    }
  }
  const srcset =
    (el.getAttribute && el.getAttribute('data-srcset')) ||
    (el.getAttribute && el.getAttribute('srcset'));
  if (srcset) {
    const first = srcset.split(',')[0].trim().split(' ')[0];
    try {
      return new URL(first, location.href).href;
    } catch (_) {
      return first;
    }
  }
  const style = el.style && el.style.backgroundImage;
  if (style) {
    const m = style.match(/url\("?(.*?)"?\)/);
    if (m && m[1]) {
      try {
        return new URL(m[1], location.href).href;
      } catch (_) {
        return m[1];
      }
    }
  }
  if (el.currentSrc) return el.currentSrc;
  if (el.src) return el.src;
  return '';
}

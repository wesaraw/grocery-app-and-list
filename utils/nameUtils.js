export function canonicalName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function titleCaseName(name) {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      if (!word) return '';
      const first = word.charAt(0).toUpperCase();
      const rest = word.slice(1).toLowerCase();
      return `${first}${rest}`;
    })
    .join(' ');
}

const NAME_SYNONYMS = {
  'paper towels': ['tissue', 'bounty'],
  'bounty paper towels': ['tissue', 'bounty']
};

function nameWords(itemName) {
  const canonical = canonicalName(itemName);
  const synonyms = NAME_SYNONYMS[canonical] || [];
  return [...new Set([...canonical.split(' '), ...synonyms])].filter(Boolean);
}

export function nameMatchesProduct(productName, itemName) {
  const prod = canonicalName(productName);
  return nameWords(itemName).some(w => prod.includes(w));
}

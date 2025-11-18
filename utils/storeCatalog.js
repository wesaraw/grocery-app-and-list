const STORE_LINKS = {
  'Stop & Shop': name =>
    `https://stopandshop.com/product-search/${name
      .replace(/ /g, '%20')}?searchRef=&semanticSearch=false`,
  Walmart: name =>
    `https://www.walmart.com/search?q=${encodeURIComponent(
      name.replace(/ /g, '+')
    )}&facet=fulfillment_method_in_store%3AIn-store%7C%7Cexclude_oos%3AShow+available+items+only`,
  Amazon: name =>
    `https://www.amazon.com/s?k=${name
      .split(/\s+/)
      .map(encodeURIComponent)
      .join('+')}`,
  Shaws: name =>
    `https://www.shaws.com/shop/search-results.html?q=${name.replace(/ /g, '%20')}`,
  'Roche Bros': name =>
    `https://onlineshopping.rochebros.com/search?searchTerms=${name.replace(/ /g, '%20')}`,
  Hannaford: name =>
    `https://www.hannaford.com/search/product?form_state=searchForm&keyword=${name.replace(/ /g, '+')}&ieDummyTextField=&productTypeId=P`
};

const STORE_NAMES = Object.freeze(Object.keys(STORE_LINKS));

export { STORE_LINKS };

export function getStoreNamesForItem() {
  return [...STORE_NAMES];
}

export function getStoreLink(storeName, itemName = '') {
  const builder = STORE_LINKS[storeName];
  if (typeof builder !== 'function') return '';
  return builder(itemName || '');
}

export function getStoreEntriesForItem(itemName) {
  return getStoreNamesForItem().map(store => ({
    name: itemName,
    store,
    link: getStoreLink(store, itemName)
  }));
}

export async function loadJSON(path) {
  let url = path;
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    url = chrome.runtime.getURL(path);
  }
  try {
    const res = await fetch(url);
    return res.json();
  } catch (e) {
    if (url !== path) {
      const res = await fetch(path);
      return res.json();
    }
    throw e;
  }
}

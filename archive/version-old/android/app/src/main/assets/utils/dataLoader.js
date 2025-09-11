export async function loadJSON(path) {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  return res.json();
}

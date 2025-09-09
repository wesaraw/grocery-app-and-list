chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'openStoreTab' && message.url) {
    chrome.tabs.create({ url: message.url }, tab => {
      sendResponse({ tabId: tab.id });
    });
    return true; // keep the message channel open for sendResponse
  }
});

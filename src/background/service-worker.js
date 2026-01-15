// Minimal MV3 service worker for SF CRM Extractor

console.log('[SF CRM Extractor] Service worker started');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[SF CRM Extractor] Extension installed or updated');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SF CRM Extractor] Message received in service worker:', message, 'from', sender);

  if (message && message.type === 'PING') {
    sendResponse({ type: 'PONG', received: true });
  }

  // Return true if you plan to send an async response
  return false;
});

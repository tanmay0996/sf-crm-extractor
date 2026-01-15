// Minimal content script for SF CRM Extractor

console.log('[SF CRM Extractor] Content script loaded on', window.location.href);

try {
  chrome.runtime.sendMessage(
    { type: 'PING', source: 'content-script' },
    (response) => {
      console.log('[SF CRM Extractor] Response from service worker:', response);
    }
  );
} catch (err) {
  console.error('[SF CRM Extractor] Error sending message to service worker', err);
}

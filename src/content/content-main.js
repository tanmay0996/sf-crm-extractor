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

// If the Opportunity extractor has attached a manual hook, log its presence
// so it is easy to trigger from devtools for testing.
if (typeof window.runOpportunityExtraction === 'function') {
  console.log('[SF CRM Extractor] Opportunity extractor hook available as window.runOpportunityExtraction()');
}

if (typeof window.runOpportunityListExtractionVisible === 'function') {
  console.log(
    '[SF CRM Extractor] List view extractor hook available as window.runOpportunityListExtractionVisible()'
  );
}

if (typeof window.runOpportunityKanbanExtractionVisible === 'function') {
  console.log(
    '[SF CRM Extractor] Kanban extractor hook available as window.runOpportunityKanbanExtractionVisible()'
  );
}

if (typeof window.runAccountContactsRelatedListExtractionVisible === 'function') {
  console.log(
    '[SF CRM Extractor] Related Contacts extractor hook available as window.runAccountContactsRelatedListExtractionVisible()'
  );
}

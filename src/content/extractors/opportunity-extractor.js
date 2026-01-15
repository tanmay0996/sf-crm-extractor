// Opportunity extractor for Salesforce Lightning record detail pages
// All extraction logic for Opportunity lives in this module.

(function () {
  const DEBOUNCE_MS = 300;
  let debounceTimer = null;

  function isOpportunityUrl(url) {
    if (!url) return false;
    // Match URLs like /lightning/r/Opportunity/{id}/view or without trailing /view
    return /\/lightning\/r\/Opportunity\//.test(url);
  }

  function getSalesforceIdFromUrl(url) {
    const match = url.match(/\/lightning\/r\/Opportunity\/([^/]+)/);
    return match ? match[1] : null;
  }

  function normalizeText(node) {
    if (!node) return '';
    return node.textContent.replace(/\s+/g, ' ').trim();
  }

  // Try a chain of selectors; if none return a value, use label-based fallback.
  function getFieldValue(selectorConfigs, labelFallbackText) {
    // 1) Try all explicit selectors first
    for (const cfg of selectorConfigs || []) {
      if (!cfg || !cfg.selector) continue;
      const el = document.querySelector(cfg.selector);
      if (el) {
        const text = (cfg.getter || normalizeText)(el);
        if (text) {
          return text;
        }
      }
    }

    // 2) Label-based fallback: find label element then its value sibling/ancestor
    if (labelFallbackText) {
      const labelCandidates = Array.from(
        document.querySelectorAll('label, .slds-form-element__label, .slds-form-element__label span, [title]')
      );

      const loweredTarget = labelFallbackText.toLowerCase();

      for (const label of labelCandidates) {
        const labelText = normalizeText(label).toLowerCase();
        if (!labelText || !labelText.includes(loweredTarget)) continue;

        // Common Lightning pattern: label and value in the same form element container
        const container = label.closest('.slds-form-element, .slds-form-element_horizontal, .test-id__field-label');
        if (container) {
          const valueEl = container.querySelector(
            '.slds-form-element__control, .slds-form-element__static, .slds-form-element__static span, .slds-form-element__static div, [data-output-element-id]'
          );
          const valueText = normalizeText(valueEl);
          if (valueText) {
            return valueText;
          }
        }

        // Fallback: look at next sibling text node/span/div
        let sibling = label.nextElementSibling;
        if (sibling) {
          const siblingText = normalizeText(sibling);
          if (siblingText) {
            return siblingText;
          }
        }
      }
    }

    return '';
  }

  function parseAmount(raw) {
    if (!raw) return null;
    const numeric = raw.replace(/[^0-9.-]/g, '');
    if (!numeric) return null;
    const value = Number(numeric);
    return Number.isNaN(value) ? null : value;
  }

  function parseProbability(raw) {
    if (!raw) return null;
    const numeric = raw.replace(/[^0-9.-]/g, '');
    if (!numeric) return null;
    const value = Number.parseInt(numeric, 10);
    return Number.isNaN(value) ? null : value;
  }

  function parseDateToIso(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function detectOpportunityHeader() {
    // Fallback detection when URL is not enough: look for header text with "Opportunity"
    const header = document.querySelector('h1, .slds-page-header__title, .entityNameTitle, .slds-truncate');
    const text = normalizeText(header).toLowerCase();
    if (!text) return false;
    return text.includes('opportunity');
  }

  function extractOpportunityRecord() {
    const url = window.location.href;
    const isOpp = isOpportunityUrl(url) || detectOpportunityHeader();
    if (!isOpp) {
      return null;
    }

    const salesforceIdFromUrl = getSalesforceIdFromUrl(url);

    // Prefer data attributes on record wrapper if available
    const recordContainer = document.querySelector('[data-recordid], [data-record-id], [data-record-id-value]');
    const salesforceId =
      (recordContainer &&
        (recordContainer.getAttribute('data-recordid') ||
          recordContainer.getAttribute('data-record-id') ||
          recordContainer.getAttribute('data-record-id-value'))) ||
      salesforceIdFromUrl ||
      null;

    // Define selector chains for common fields in Lightning layouts.
    const nameText = getFieldValue(
      [
        { selector: 'records-record-layout-item[field-label="Opportunity Name"] lightning-formatted-text' },
        { selector: 'a[title][data-output-element-id*="RecordName"], a[title].slds-truncate' },
        { selector: 'records-record-layout-item[field-label="Opportunity Name"]' }
      ],
      'Opportunity Name'
    );

    const amountText = getFieldValue(
      [
        { selector: 'records-record-layout-item[field-label="Amount"] lightning-formatted-number' },
        { selector: 'records-record-layout-item[field-label="Amount"] lightning-formatted-text' },
        { selector: '[data-output-element-id*="Amount"]' }
      ],
      'Amount'
    );

    const stageText = getFieldValue(
      [
        { selector: 'records-record-layout-item[field-label="Stage"] lightning-formatted-text' },
        { selector: '[data-output-element-id*="StageName"]' }
      ],
      'Stage'
    );

    const probText = getFieldValue(
      [
        { selector: 'records-record-layout-item[field-label="Probability"] lightning-formatted-number' },
        { selector: '[data-output-element-id*="Probability"]' }
      ],
      'Probability'
    );

    const closeDateText = getFieldValue(
      [
        { selector: 'records-record-layout-item[field-label="Close Date"] lightning-formatted-date-time' },
        { selector: 'records-record-layout-item[field-label="Close Date"] lightning-formatted-text' },
        { selector: '[data-output-element-id*="CloseDate"]' }
      ],
      'Close Date'
    );

    const accountNameText = getFieldValue(
      [
        { selector: 'records-record-layout-item[field-label="Account Name"] a' },
        { selector: '[data-output-element-id*="AccountId"] a' }
      ],
      'Account Name'
    );

    const ownerNameText = getFieldValue(
      [
        { selector: 'records-record-layout-item[field-label="Owner"] a' },
        { selector: '[data-output-element-id*="OwnerId"] a' }
      ],
      'Owner'
    );

    const record = {
      salesforceId: salesforceId || null,
      name: nameText || null,
      amount: parseAmount(amountText),
      stage: stageText || null,
      probability: parseProbability(probText),
      closeDate: parseDateToIso(closeDateText),
      accountName: accountNameText || null,
      ownerName: ownerNameText || null,
      lastUpdated: new Date().toISOString(),
      sourceUrl: url
    };

    return record;
  }

  function runExtractionAndReport(reason) {
    const record = extractOpportunityRecord();
    if (!record) {
      console.log('[SF CRM Extractor][Opportunity] No Opportunity record detected (reason:', reason, ').');
      return;
    }

    console.log('[SF CRM Extractor][Opportunity] Extracted record:', record);

    try {
      chrome.runtime.sendMessage({
        type: 'EXTRACTION_RESULT',
        objectType: 'opportunity',
        payload: record
      });
    } catch (err) {
      console.error('[SF CRM Extractor][Opportunity] Error sending extraction result', err);
    }
  }

  function setupObserver() {
    if (!document.body) {
      return;
    }

    const observer = new MutationObserver(() => {
      // Debounce extraction calls while the page is still rendering.
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runExtractionAndReport('mutation-debounced'), DEBOUNCE_MS);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial extraction once the DOM is ready.
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      runExtractionAndReport('initial-load');
    } else {
      window.addEventListener('DOMContentLoaded', () => runExtractionAndReport('dom-content-loaded'));
    }

    console.log('[SF CRM Extractor][Opportunity] MutationObserver initialized.');
  }

  // Expose a manual hook for testing from devtools console.
  window.runOpportunityExtraction = function () {
    console.log('[SF CRM Extractor][Opportunity] Manual extraction triggered');
    runExtractionAndReport('manual-call');
  };

  setupObserver();
})();

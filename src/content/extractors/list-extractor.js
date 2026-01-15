// List view extractor for Salesforce Lightning Opportunity list pages.
// Scrapes visible rows only and sends records as EXTRACTION_RESULT messages.

(function () {
  function isOpportunityListUrl(url) {
    if (!url) return false;
    // Common patterns: /lightning/o/Opportunity/list, /lightning/o/Opportunity/list?filterName=... etc.
    return /\/lightning\/o\/Opportunity\/(list|home)/.test(url);
  }

  function normalizeText(node) {
    if (!node) return '';
    return node.textContent.replace(/\s+/g, ' ').trim();
  }

  function getIdFromRow(row) {
    if (!row) return null;
    const attrId =
      row.getAttribute('data-recordid') ||
      row.getAttribute('data-record-id') ||
      row.getAttribute('data-row-key-value');
    if (attrId) return attrId;

    // Fallback: look for anchor with href containing /Opportunity/{id}/
    const link = row.querySelector('a[href*="/lightning/r/Opportunity/"]');
    if (link && link.getAttribute('href')) {
      const match = link.getAttribute('href').match(/Opportunity\/([^/]+)/);
      if (match) return match[1];
    }

    return null;
  }

  function extractCellByLabel(row, label) {
    if (!row) return '';
    const selector = `td[data-label="${label}"]`; // standard Lightning list views
    const cell = row.querySelector(selector) || row.querySelector(`*[data-label="${label}"]`);
    if (cell) return normalizeText(cell);
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

  function getVisibleRows() {
    // Lightning list views use a grid table; we focus on tbody rows that are data rows.
    const table = document.querySelector('table[role="grid"], table[data-aura-class*="uiVirtualDataTable"]');
    if (!table) return [];
    const rows = table.querySelectorAll('tbody tr');
    return Array.from(rows).filter((row) => !row.getAttribute('data-js-shuffle-id'));
  }

  function buildRecordFromRow(row, rowIndex) {
    const salesforceId = getIdFromRow(row);

    const nameText = extractCellByLabel(row, 'Opportunity Name') || extractCellByLabel(row, 'Name');
    const accountNameText = extractCellByLabel(row, 'Account Name') || extractCellByLabel(row, 'Account');
    const amountText = extractCellByLabel(row, 'Amount');
    const stageText = extractCellByLabel(row, 'Stage');
    const probabilityText = extractCellByLabel(row, 'Probability');
    const closeDateText = extractCellByLabel(row, 'Close Date');

    const url = window.location.href;

    return {
      salesforceId: salesforceId || null,
      name: nameText || null,
      amount: parseAmount(amountText),
      stage: stageText || null,
      probability: parseProbability(probabilityText),
      closeDate: parseDateToIso(closeDateText),
      accountName: accountNameText || null,
      ownerName: null,
      lastUpdated: new Date().toISOString(),
      sourceUrl: url,
      sourcePage: url,
      rowIndex: rowIndex
    };
  }

  function sendRecords(records, reason) {
    if (!records || records.length === 0) {
      console.log('[SF CRM Extractor][ListView] No rows to send (reason:', reason, ').');
      if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
        window.SFCrmIndicator.setStatus('error');
      }
      return;
    }

    records.forEach((record) => {
      if (!record.salesforceId) {
        // We prefer to have a Salesforce ID, but if it is missing we still send
        // the record so the background script can key it using a deterministic
        // hash based on other fields.
        console.warn('[SF CRM Extractor][ListView] Sending row without salesforceId; will rely on hash key', record);
      }

      try {
        chrome.runtime.sendMessage({
          type: 'EXTRACTION_RESULT',
          objectType: 'opportunity',
          payload: record
        });
      } catch (err) {
        console.error('[SF CRM Extractor][ListView] Error sending record', err, record);
      }
    });

    console.log('[SF CRM Extractor][ListView] Sent records count:', records.length);
    if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
      window.SFCrmIndicator.setStatus('success');
    }
  }

  function runListExtractionVisible(reason) {
    const url = window.location.href;
    if (!isOpportunityListUrl(url)) {
      console.log('[SF CRM Extractor][ListView] Not an Opportunity list view (url:', url, ', reason:', reason, ')');
      return;
    }

    if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
      window.SFCrmIndicator.setStatus('extracting');
    }

    const rows = getVisibleRows();
    const records = rows.map((row, index) => buildRecordFromRow(row, index));
    sendRecords(records, reason);
  }

  // Expose a manual hook to scrape currently visible rows only.
  window.runOpportunityListExtractionVisible = function () {
    console.log('[SF CRM Extractor][ListView] Manual visible-rows extraction triggered');
    runListExtractionVisible('manual-visible');
  };
})();

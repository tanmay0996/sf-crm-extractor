// Related list extractor for Salesforce Lightning Account detail pages.
// Scrapes visible Contacts from the Contacts related list and sends them as contact records.

(function () {
  function isAccountDetailUrl(url) {
    if (!url) return false;
    return /\/lightning\/r\/Account\//.test(url);
  }

  function getAccountIdFromUrl(url) {
    const match = url && url.match(/\/lightning\/r\/Account\/([^/]+)/);
    return match ? match[1] : null;
  }

  function normalizeText(node) {
    if (!node) return '';
    return node.textContent.replace(/\s+/g, ' ').trim();
  }

  function getContactsRelatedListRoot() {
    // Attempt to locate a related list region whose label includes "Contacts".
    const articles = document.querySelectorAll('article[aria-label], div[aria-label]');
    for (const el of Array.from(articles)) {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('contact') || label.includes('contacts')) {
        if (el.querySelector('table[role="grid"], table')) {
          return el;
        }
      }
    }

    // Fallback: generic related list region via data-component or data-target.
    const rel = document.querySelector('[data-component-id*="RelatedContact"], [data-target-selection-name*="Contacts"]');
    if (rel) {
      return rel;
    }

    return null;
  }

  function getContactsRows(root) {
    if (!root) return [];
    const table = root.querySelector('table[role="grid"], table');
    if (!table) return [];
    const rows = table.querySelectorAll('tbody tr');
    return Array.from(rows);
  }

  function extractCellByLabel(row, label) {
    if (!row) return '';
    const cell = row.querySelector(`td[data-label="${label}"]`) || row.querySelector(`*[data-label="${label}"]`);
    if (cell) return normalizeText(cell);
    return '';
  }

  function getContactIdFromRow(row) {
    if (!row) return null;
    const attrId =
      row.getAttribute('data-recordid') ||
      row.getAttribute('data-record-id') ||
      row.getAttribute('data-row-key-value');
    if (attrId) return attrId;

    const link = row.querySelector('a[href*="/lightning/r/Contact/"]');
    if (link && link.getAttribute('href')) {
      const match = link.getAttribute('href').match(/Contact\/([^/]+)/);
      if (match) return match[1];
    }

    return null;
  }

  function buildContactRecordFromRow(row, rowIndex, accountId) {
    const contactId = getContactIdFromRow(row);

    const nameText = extractCellByLabel(row, 'Name') || normalizeText(row.querySelector('a[title]'));
    const emailText = extractCellByLabel(row, 'Email');
    const phoneText = extractCellByLabel(row, 'Phone');
    const titleText = extractCellByLabel(row, 'Title');

    const url = window.location.href;

    return {
      salesforceId: contactId || null,
      name: nameText || null,
      email: emailText || null,
      phone: phoneText || null,
      title: titleText || null,
      accountId: accountId || null,
      lastUpdated: new Date().toISOString(),
      sourceUrl: url,
      sourcePage: url,
      rowIndex: rowIndex
    };
  }

  function sendContacts(records, reason) {
    if (!records || records.length === 0) {
      console.log('[SF CRM Extractor][RelatedContacts] No contacts to send (reason:', reason, ').');
      if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
        window.SFCrmIndicator.setStatus('error');
      }
      return;
    }

    records.forEach((record) => {
      if (!record.salesforceId) {
        console.warn('[SF CRM Extractor][RelatedContacts] Skipping row without contact Id', record);
        return;
      }

      try {
        chrome.runtime.sendMessage({
          type: 'EXTRACTION_RESULT',
          objectType: 'contact',
          payload: record
        });
      } catch (err) {
        console.error('[SF CRM Extractor][RelatedContacts] Error sending record', err, record);
      }
    });

    console.log('[SF CRM Extractor][RelatedContacts] Sent contacts count:', records.length);
    if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
      window.SFCrmIndicator.setStatus('success');
    }
  }

  function runRelatedContactsExtractionVisible(reason) {
    const url = window.location.href;
    if (!isAccountDetailUrl(url)) {
      console.log('[SF CRM Extractor][RelatedContacts] Not an Account detail page (url:', url, ', reason:', reason, ')');
      return;
    }

    const accountId = getAccountIdFromUrl(url);
    const root = getContactsRelatedListRoot();
    if (!root) {
      console.log('[SF CRM Extractor][RelatedContacts] Contacts related list root not found');
      return;
    }

    if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
      window.SFCrmIndicator.setStatus('extracting');
    }

    const rows = getContactsRows(root);
    const records = rows.map((row, index) => buildContactRecordFromRow(row, index, accountId));
    sendContacts(records, reason);
  }

  window.runAccountContactsRelatedListExtractionVisible = function () {
    console.log('[SF CRM Extractor][RelatedContacts] Manual visible-rows extraction triggered');
    runRelatedContactsExtractionVisible('manual-visible');
  };
})();

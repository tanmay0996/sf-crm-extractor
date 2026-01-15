// Kanban extractor for Salesforce Lightning Opportunity Kanban views.
// Scrapes visible cards only and sends records as EXTRACTION_RESULT messages.

(function () {
  function isOpportunityKanbanUrl(url) {
    if (!url) return false;
    // Kanban views usually contain "kanban" or viewType=kanban in the URL
    return /\/lightning\/o\/Opportunity\//.test(url) && /kanban/i.test(url);
  }

  function normalizeText(node) {
    if (!node) return '';
    return node.textContent.replace(/\s+/g, ' ').trim();
  }

  function parseAmount(raw) {
    if (!raw) return null;
    const numeric = raw.replace(/[^0-9.-]/g, '');
    if (!numeric) return null;
    const value = Number(numeric);
    return Number.isNaN(value) ? null : value;
  }

  function parseDateToIso(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function getIdFromCard(card) {
    if (!card) return null;
    const attrId =
      card.getAttribute('data-recordid') ||
      card.getAttribute('data-record-id') ||
      card.getAttribute('data-key');
    if (attrId) return attrId;

    const link = card.querySelector('a[href*="/lightning/r/Opportunity/"]');
    if (link && link.getAttribute('href')) {
      const match = link.getAttribute('href').match(/Opportunity\/([^/]+)/);
      if (match) return match[1];
    }

    return null;
  }

  function getKanbanColumnsRoot() {
    // Try to locate the Kanban board container.
    return (
      document.querySelector('[data-aura-class*="kanbanBoard"]') ||
      document.querySelector('.slds-kanban') ||
      document.querySelector('.kanbanContainer')
    );
  }

  function extractColumnStage(columnEl) {
    if (!columnEl) return null;
    const header =
      columnEl.querySelector('[data-aura-class*="kanbanColumnHeader"], .slds-kanban__header, header, h2, h3') ||
      columnEl;
    const text = normalizeText(header).toLowerCase();
    if (!text) return null;
    // Often header text already equals the Stage name.
    return text.replace(/\s+\(.*\)$/, '');
  }

  function buildRecordFromCard(card, stage, rowIndex) {
    const salesforceId = getIdFromCard(card);

    const nameEl =
      card.querySelector('a[title], a[data-output-element-id*="Name"], a.slds-truncate') || card.querySelector('a');
    const amountEl = card.querySelector('[data-output-element-id*="Amount"], .amount, .currency');
    const closeDateEl = card.querySelector('[data-output-element-id*="CloseDate"], .date, time');

    const nameText = normalizeText(nameEl);
    const amountText = normalizeText(amountEl);
    const closeDateText = normalizeText(closeDateEl);

    const url = window.location.href;

    return {
      salesforceId: salesforceId || null,
      name: nameText || null,
      amount: parseAmount(amountText),
      stage: stage || null,
      probability: null,
      closeDate: parseDateToIso(closeDateText),
      accountName: null,
      ownerName: null,
      lastUpdated: new Date().toISOString(),
      sourceUrl: url,
      sourcePage: url,
      rowIndex: rowIndex
    };
  }

  function sendRecords(records, reason) {
    if (!records || records.length === 0) {
      console.log('[SF CRM Extractor][Kanban] No cards to send (reason:', reason, ').');
      if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
        window.SFCrmIndicator.setStatus('error');
      }
      return;
    }

    records.forEach((record) => {
      if (!record.salesforceId) {
        console.warn('[SF CRM Extractor][Kanban] Skipping card without salesforceId', record);
        return;
      }

      try {
        chrome.runtime.sendMessage({
          type: 'EXTRACTION_RESULT',
          objectType: 'opportunity',
          payload: record
        });
      } catch (err) {
        console.error('[SF CRM Extractor][Kanban] Error sending record', err, record);
      }
    });

    console.log('[SF CRM Extractor][Kanban] Sent records count:', records.length);
    if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
      window.SFCrmIndicator.setStatus('success');
    }
  }

  function runKanbanExtractionVisible(reason) {
    const url = window.location.href;
    if (!isOpportunityKanbanUrl(url)) {
      console.log('[SF CRM Extractor][Kanban] Not an Opportunity Kanban view (url:', url, ', reason:', reason, ')');
      return;
    }

    const root = getKanbanColumnsRoot();
    if (!root) {
      console.log('[SF CRM Extractor][Kanban] Kanban root not found');
      return;
    }

    if (window.SFCrmIndicator && typeof window.SFCrmIndicator.setStatus === 'function') {
      window.SFCrmIndicator.setStatus('extracting');
    }

    const columns = root.querySelectorAll('[data-role="kanban-column"], .slds-kanban__list');
    const records = [];

    Array.from(columns).forEach((columnEl) => {
      const stage = extractColumnStage(columnEl);
      const cards = columnEl.querySelectorAll('[data-aura-class*="kanbanCard"], .slds-kanban__item');
      Array.from(cards).forEach((cardEl, idx) => {
        records.push(buildRecordFromCard(cardEl, stage, idx));
      });
    });

    sendRecords(records, reason);
  }

  window.runOpportunityKanbanExtractionVisible = function () {
    console.log('[SF CRM Extractor][Kanban] Manual visible-cards extraction triggered');
    runKanbanExtractionVisible('manual-visible');
  };
})();

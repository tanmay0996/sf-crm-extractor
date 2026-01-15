// MV3 service worker for SF CRM Extractor

import {
  SALESFORCE_STORAGE_KEY,
  createEmptySalesforceData,
  ensureTypeBucket
} from './storage-schema.js';

console.log('[SF CRM Extractor] Service worker started');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[SF CRM Extractor] Extension installed or updated');
});

/**
 * Helpers for chrome.storage.local using Promises and small retry logic.
 */
function getLocal(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (items) => {
      if (chrome.runtime.lastError) {
        console.error('[SF CRM Extractor][Storage] get error', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(items[key]);
    });
  });
}

function setLocalWithRetry(key, value, maxRetries = 2) {
  let attempt = 0;

  return new Promise((resolve, reject) => {
    const write = () => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError;
          console.warn('[SF CRM Extractor][Storage] set error on attempt', attempt + 1, err);
          if (attempt < maxRetries) {
            attempt += 1;
            // Small backoff before retrying
            setTimeout(write, 200 * attempt);
          } else {
            reject(err);
          }
          return;
        }
        resolve();
      });
    };

    write();
  });
}

function computeDeterministicKey(objectType, record) {
  const base = `${objectType}|${record.name || ''}|${record.accountName || ''}|${record.closeDate || ''}`;
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash * 31 + base.charCodeAt(i)) | 0;
  }
  return `hash_${Math.abs(hash)}`;
}

function parseIsoToMs(value) {
  if (!value) return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

function countNonEmptyFields(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  const ignore = new Set([
    'lastUpdated',
    'sourceUrl',
    'sourcePage',
    'rowIndex',
    'deleted',
    'deletedAt'
  ]);
  let count = 0;
  Object.keys(obj).forEach((key) => {
    if (ignore.has(key)) return;
    const value = obj[key];
    if (value === null || value === undefined) return;
    if (typeof value === 'string' && value.trim() === '') return;
    count += 1;
  });
  return count;
}

/**
 * Merge a single Salesforce record into chrome.storage.local.salesforce_data.
 *
 * Deduplication & keying:
 * - Use salesforceId if available as the storage key.
 * - Otherwise use a deterministic hash based on type + name + accountName + closeDate.
 *
 * Conflict resolution:
 * - Prefer the record with newer lastUpdated.
 * - If timestamps are equal, prefer the more complete record (more non-empty fields).
 */
async function mergeSalesforceRecord(objectType, record) {
  if (!record) {
    throw new Error('mergeSalesforceRecord requires a record payload');
  }

  const existingRoot = (await getLocal(SALESFORCE_STORAGE_KEY)) || createEmptySalesforceData();

  const bucket = ensureTypeBucket(existingRoot, objectType);

  const storageKey = record.salesforceId || computeDeterministicKey(objectType, record);
  const existing = bucket.byId[storageKey] || {};

  const nowIso = new Date().toISOString();
  const incomingLastUpdatedIso = record.lastUpdated || nowIso;
  const existingLastUpdatedIso = existing.lastUpdated || null;

  const incomingMs = parseIsoToMs(incomingLastUpdatedIso);
  const existingMs = parseIsoToMs(existingLastUpdatedIso);

  let chosen;

  if (!existingLastUpdatedIso) {
    // No existing record: take incoming as-is (merged with any residual fields).
    chosen = { ...existing, ...record };
  } else if (incomingMs > existingMs) {
    // Incoming is newer.
    chosen = { ...existing, ...record };
  } else if (incomingMs < existingMs) {
    // Existing is newer; keep it, but still merge in non-conflicting metadata if desired.
    chosen = { ...existing };
  } else {
    // Same timestamp; prefer the more complete record.
    const existingScore = countNonEmptyFields(existing);
    const incomingScore = countNonEmptyFields(record);
    if (incomingScore >= existingScore) {
      chosen = { ...existing, ...record };
    } else {
      chosen = { ...existing };
    }
  }

  // Ensure bookkeeping fields are set.
  chosen.lastUpdated = incomingMs >= existingMs ? incomingLastUpdatedIso : existingLastUpdatedIso || nowIso;

  // Persist under computed storage key.
  bucket.byId[storageKey] = chosen;
  bucket.lastSync = nowIso;

  await setLocalWithRetry(SALESFORCE_STORAGE_KEY, existingRoot, 2);

  return { objectType, id: storageKey, record: chosen };
}

// Track pending REQUEST_EXTRACT_ACTIVE_TAB flows so we can resolve them when
// the corresponding EXTRACTION_RESULT arrives from content scripts.
const pendingExtractions = new Map(); // key: objectType, value: { resolve, timeoutId }

async function handleMergeRecordMessage(message) {
  const { objectType, record } = message.payload || {};
  if (!objectType || !record) {
    return { status: 'error', error: 'MERGE_RECORD requires payload.objectType and payload.record' };
  }

  try {
    const result = await mergeSalesforceRecord(objectType, record);
    return { status: 'ok', updated: result };
  } catch (err) {
    console.error('[SF CRM Extractor][MERGE_RECORD] Failed to merge record', err);
    return { status: 'error', error: String(err && err.message ? err.message : err) };
  }
}

async function handleRequestExtractActiveTab(message) {
  const { objectType } = message;
  if (!objectType) {
    return { status: 'error', error: 'REQUEST_EXTRACT_ACTIVE_TAB requires objectType' };
  }

  // Look up the active tab in the current window.
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs && tabs[0];
  if (!activeTab || !activeTab.id) {
    return { status: 'error', error: 'No active tab found' };
  }

  // Wrap in a Promise that resolves when merge is complete or the timeout fires.
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      // If we time out, clean up any pending entry for this type.
      if (pendingExtractions.has(objectType)) {
        pendingExtractions.delete(objectType);
      }
      resolve({ status: 'timeout', objectType });
    }, 10_000);

    pendingExtractions.set(objectType, { resolve, timeoutId });

    try {
      chrome.tabs.sendMessage(activeTab.id, { type: 'RUN_EXTRACTION', objectType }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[SF CRM Extractor][REQUEST_EXTRACT_ACTIVE_TAB] Error sending RUN_EXTRACTION', chrome.runtime.lastError);
          clearTimeout(timeoutId);
          pendingExtractions.delete(objectType);
          resolve({ status: 'error', error: chrome.runtime.lastError.message || 'Failed to send RUN_EXTRACTION' });
          return;
        }

        // We do not rely on the immediate response; the actual completion
        // will be signaled when an EXTRACTION_RESULT message is merged.
        console.log('[SF CRM Extractor][REQUEST_EXTRACT_ACTIVE_TAB] RUN_EXTRACTION dispatched', response);
      });
    } catch (err) {
      console.error('[SF CRM Extractor][REQUEST_EXTRACT_ACTIVE_TAB] Unexpected error', err);
      clearTimeout(timeoutId);
      pendingExtractions.delete(objectType);
      resolve({ status: 'error', error: String(err && err.message ? err.message : err) });
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[SF CRM Extractor] Message received in service worker:', message, 'from', sender);

  if (!message || !message.type) {
    return false;
  }

  if (message.type === 'PING') {
    sendResponse({ type: 'PONG', received: true });
    return false;
  }

  if (message.type === 'EXTRACTION_RESULT') {
    const { objectType, payload } = message;
    if (!objectType || !payload) {
      console.warn('[SF CRM Extractor][EXTRACTION_RESULT] Missing objectType or payload');
      return false;
    }

    mergeSalesforceRecord(objectType, payload)
      .then((result) => {
        console.log('[SF CRM Extractor][EXTRACTION_RESULT] Merged record', result);

        const pending = pendingExtractions.get(objectType);
        if (pending) {
          pendingExtractions.delete(objectType);
          clearTimeout(pending.timeoutId);
          pending.resolve({ status: 'ok', updated: result });
        }
      })
      .catch((err) => {
        console.error('[SF CRM Extractor][EXTRACTION_RESULT] Failed to merge record', err);
        const pending = pendingExtractions.get(objectType);
        if (pending) {
          pendingExtractions.delete(objectType);
          clearTimeout(pending.timeoutId);
          pending.resolve({ status: 'error', error: String(err && err.message ? err.message : err) });
        }
      });

    // Asynchronous response (if any) will be handled via pendingExtractions.
    return false;
  }

  if (message.type === 'MERGE_RECORD') {
    handleMergeRecordMessage(message)
      .then((result) => sendResponse(result))
      .catch((err) => {
        sendResponse({ status: 'error', error: String(err && err.message ? err.message : err) });
      });

    // Indicate we will respond asynchronously.
    return true;
  }

  if (message.type === 'OPEN_DEBUG_VIEW') {
    try {
      const url = chrome.runtime.getURL('popup/index.html');
      chrome.tabs.create({ url }, () => {
        if (chrome.runtime.lastError) {
          console.error('[SF CRM Extractor][OPEN_DEBUG_VIEW] Failed to open debug view', chrome.runtime.lastError);
          sendResponse({ status: 'error', error: chrome.runtime.lastError.message || 'Failed to open debug view' });
          return;
        }
        sendResponse({ status: 'ok' });
      });
      return true;
    } catch (err) {
      console.error('[SF CRM Extractor][OPEN_DEBUG_VIEW] Unexpected error', err);
      sendResponse({ status: 'error', error: String(err && err.message ? err.message : err) });
      return false;
    }
  }

  if (message.type === 'REQUEST_EXTRACT_ACTIVE_TAB') {
    handleRequestExtractActiveTab(message)
      .then((result) => sendResponse(result))
      .catch((err) => {
        sendResponse({ status: 'error', error: String(err && err.message ? err.message : err) });
      });

    // Indicate we will respond asynchronously.
    return true;
  }

  return false;
});

// Log storage changes for visibility, including lastSync per object type.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[SALESFORCE_STORAGE_KEY]) {
    return;
  }

  const newValue = changes[SALESFORCE_STORAGE_KEY].newValue;
  if (!newValue) {
    console.log('[SF CRM Extractor][Storage] salesforce_data cleared or removed');
    return;
  }

  const summary = {};
  ['leads', 'contacts', 'accounts', 'opportunities', 'tasks'].forEach((key) => {
    if (newValue[key]) {
      summary[key] = {
        lastSync: newValue[key].lastSync || null,
        count: newValue[key].byId ? Object.keys(newValue[key].byId).length : 0
      };
    }
  });

  console.log('[SF CRM Extractor][Storage] salesforce_data changed', summary);
});

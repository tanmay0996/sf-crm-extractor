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

/**
 * Merge a single Salesforce record into chrome.storage.local.salesforce_data.
 *
 * - If the record Id already exists, only updated fields are overwritten; any
 *   fields missing from the new payload are preserved from the existing
 *   record. lastUpdated is always refreshed.
 * - If the record Id does not exist, a new entry is created.
 */
async function mergeSalesforceRecord(objectType, record) {
  if (!record || !record.salesforceId) {
    throw new Error('mergeSalesforceRecord requires a record with salesforceId');
  }

  const existingRoot = (await getLocal(SALESFORCE_STORAGE_KEY)) || createEmptySalesforceData();

  const bucket = ensureTypeBucket(existingRoot, objectType);

  const id = record.salesforceId;
  const existing = bucket.byId[id] || {};

  const nowIso = new Date().toISOString();

  // Shallow-merge fields, preferring incoming record while preserving any
  // fields that are not present on the new payload.
  const merged = {
    ...existing,
    ...record,
    lastUpdated: record.lastUpdated || nowIso
  };

  bucket.byId[id] = merged;
  bucket.lastSync = nowIso;

  await setLocalWithRetry(SALESFORCE_STORAGE_KEY, existingRoot, 2);

  return { objectType, id, record: merged };
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

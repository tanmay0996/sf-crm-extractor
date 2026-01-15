// Helper functions for interacting with chrome.storage and background scripts
// from the popup UI.

const SALESFORCE_STORAGE_KEY = 'salesforce_data';

function withChromePromise(fn) {
  return new Promise((resolve, reject) => {
    try {
      fn((result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function getSalesforceData() {
  return withChromePromise((cb) => {
    chrome.storage.local.get(SALESFORCE_STORAGE_KEY, (items) => {
      cb(items[SALESFORCE_STORAGE_KEY] || null);
    });
  });
}

export async function getOpportunities() {
  const root = (await getSalesforceData()) || {};
  const bucket = root.opportunities || { byId: {} };
  const byId = bucket.byId || {};
  return Object.values(byId);
}

export async function mergeRecord(objectType, record) {
  if (!objectType || !record) return null;
  return withChromePromise((cb) => {
    chrome.runtime.sendMessage(
      {
        type: 'MERGE_RECORD',
        payload: { objectType, record }
      },
      (response) => cb(response || null)
    );
  });
}

export async function deleteOpportunity(id) {
  if (!id) return;

  const root = (await getSalesforceData()) || {};
  const bucket = root.opportunities || { byId: {} };
  const byId = bucket.byId || {};
  const existing = byId[id];

  if (!existing) {
    return null;
  }

  const nowIso = new Date().toISOString();

  // Soft-delete: mark record as deleted, preserving its other fields.
  const record = {
    ...existing,
    salesforceId: existing.salesforceId || id,
    deleted: true,
    deletedAt: nowIso,
    lastUpdated: nowIso
  };

  return mergeRecord('opportunity', record);
}

export async function requestExtractActiveOpportunity() {
  return withChromePromise((cb) => {
    chrome.runtime.sendMessage(
      {
        type: 'REQUEST_EXTRACT_ACTIVE_TAB',
        objectType: 'opportunity'
      },
      (response) => {
        cb(response || null);
      }
    );
  });
}

export function subscribeToSalesforceChanges(handler) {
  function listener(changes, areaName) {
    if (areaName !== 'local' || !changes[SALESFORCE_STORAGE_KEY]) return;
    const nextValue = changes[SALESFORCE_STORAGE_KEY].newValue || null;
    // Example onChanged handler: pass the full salesforce_data root to the caller
    // so the popup can update its local state in real time.
    handler(nextValue);
  }

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

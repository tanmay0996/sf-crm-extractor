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

export async function deleteOpportunity(id) {
  if (!id) return;

  const root = (await getSalesforceData()) || {};
  const bucket = root.opportunities || { byId: {} };
  const byId = bucket.byId || {};

  if (byId[id]) {
    delete byId[id];
  }

  bucket.byId = byId;
  root.opportunities = bucket;

  return withChromePromise((cb) => {
    chrome.storage.local.set({ [SALESFORCE_STORAGE_KEY]: root }, () => cb(true));
  });
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
    handler(changes[SALESFORCE_STORAGE_KEY].newValue || null);
  }

  chrome.storage.onChanged.addListener(listener);

  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

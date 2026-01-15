/**
 * Schema helpers for Salesforce data stored in chrome.storage.local.
 *
 * We keep all synced records under the `salesforce_data` key, grouped by
 * high-level object type. Each type has a `byId` map keyed by Salesforce
 * record Id and a `lastSync` timestamp that tracks the last successful
 * write for that type.
 *
 * Shape:
 *
 * chrome.storage.local.salesforce_data = {
 *   leads: {
 *     byId: {
 *       [salesforceId]: LeadRecord
 *     },
 *     lastSync: string | null // ISO timestamp of last merge for this type
 *   },
 *   contacts: { ... },
 *   accounts: { ... },
 *   opportunities: { ... },
 *   tasks: { ... }
 * };
 *
 * Where each record (e.g. Opportunity) generally has:
 * - salesforceId: string
 * - name: string | null
 * - amount: number | null (where applicable)
 * - stage / status: string | null
 * - probability: number | null (0-100)
 * - closeDate / dueDate: ISO string | null
 * - accountName / ownerName / related names: string | null
 * - lastUpdated: ISO string (when the record payload was last updated)
 * - sourceUrl: string (Salesforce page URL where extraction took place)
 */

export const SALESFORCE_STORAGE_KEY = 'salesforce_data';

// Logical object types we support.
export const OBJECT_TYPES = ['lead', 'contact', 'account', 'opportunity', 'task'];

// Map from logical type to the key used under salesforce_data.
export const OBJECT_TYPE_TO_KEY = {
  lead: 'leads',
  contact: 'contacts',
  account: 'accounts',
  opportunity: 'opportunities',
  task: 'tasks'
};

/**
 * Create a fresh, empty salesforce_data object that respects the above schema.
 */
export function createEmptySalesforceData() {
  return {
    leads: { byId: {}, lastSync: null },
    contacts: { byId: {}, lastSync: null },
    accounts: { byId: {}, lastSync: null },
    opportunities: { byId: {}, lastSync: null },
    tasks: { byId: {}, lastSync: null }
  };
}

/**
 * Ensure that a given object type bucket exists on the provided root object.
 * Returns the bucket ({ byId, lastSync }).
 */
export function ensureTypeBucket(root, objectType) {
  if (!root || typeof root !== 'object') {
    throw new Error('Root salesforce_data must be an object');
  }

  const key = OBJECT_TYPE_TO_KEY[objectType];
  if (!key) {
    throw new Error(`Unsupported object type: ${objectType}`);
  }

  if (!root[key]) {
    root[key] = { byId: {}, lastSync: null };
  } else {
    if (!root[key].byId) {
      root[key].byId = {};
    }
    if (!('lastSync' in root[key])) {
      root[key].lastSync = null;
    }
  }

  return root[key];
}

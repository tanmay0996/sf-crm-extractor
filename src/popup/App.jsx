import React, { useEffect, useMemo, useState } from 'react';
import OpportunitiesList from './OpportunitiesList.jsx';
import {
  getOpportunities,
  deleteOpportunity,
  requestExtractActiveOpportunity,
  subscribeToSalesforceChanges,
  mergeRecord
} from './storageClient.js';

const TABS = [{ id: 'opportunities', label: 'Opportunities' }];

function App() {
  const [activeTab, setActiveTab] = useState('opportunities');
  const [opportunities, setOpportunities] = useState([]);
  const [search, setSearch] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState(null); // { status, message }
  const [lastDeleted, setLastDeleted] = useState(null); // { record, timeoutId }

  // Initial load and subscription for live updates.
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const items = await getOpportunities();
        if (isMounted) {
          setOpportunities(items || []);
        }
      } catch (err) {
        console.error('[SF CRM Extractor][Popup] Failed to load opportunities', err);
      }
    };

    load();

    const unsubscribe = subscribeToSalesforceChanges((newValue) => {
      try {
        const bucket = newValue && newValue.opportunities ? newValue.opportunities : { byId: {} };
        const byId = bucket.byId || {};
        setOpportunities(Object.values(byId));
      } catch (err) {
        console.error('[SF CRM Extractor][Popup] Failed to process storage change', err);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe && unsubscribe();
    };
  }, []);

  const activeOpportunities = useMemo(
    () => opportunities.filter((item) => !item.deleted),
    [opportunities]
  );

  const filteredOpportunities = useMemo(() => {
    if (!search) return activeOpportunities;
    const q = search.toLowerCase();
    return activeOpportunities.filter((item) => {
      const fields = [
        item.name,
        item.accountName,
        item.ownerName,
        item.sourceUrl
        // email could be added here in future when present on the record
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());
      return fields.some((f) => f.includes(q));
    });
  }, [activeOpportunities, search]);

  const handleExtract = async () => {
    setIsExtracting(true);
    setExtractStatus({ status: 'pending', message: 'Running extraction on active tab…' });
    try {
      const response = await requestExtractActiveOpportunity();
      if (!response) {
        setExtractStatus({ status: 'error', message: 'No response from background script.' });
      } else if (response.status === 'ok') {
        setExtractStatus({ status: 'ok', message: 'Extraction completed and stored.' });
      } else if (response.status === 'timeout') {
        setExtractStatus({ status: 'timeout', message: 'Timed out waiting for extraction from active tab.' });
      } else {
        setExtractStatus({ status: 'error', message: response.error || 'Extraction failed.' });
      }
    } catch (err) {
      console.error('[SF CRM Extractor][Popup] Error requesting extraction', err);
      setExtractStatus({ status: 'error', message: String(err && err.message ? err.message : err) });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDelete = async (item) => {
    if (!item || !item.salesforceId) return;
    try {
      // Clear any existing undo timer
      if (lastDeleted && lastDeleted.timeoutId) {
        clearTimeout(lastDeleted.timeoutId);
      }

      const response = await deleteOpportunity(item.salesforceId);

      const timeoutId = window.setTimeout(() => {
        setLastDeleted(null);
      }, 30_000);

      setLastDeleted({ record: item, response, timeoutId });
    } catch (err) {
      console.error('[SF CRM Extractor][Popup] Failed to delete opportunity', err);
    }
  };

  const handleUndoDelete = async () => {
    if (!lastDeleted || !lastDeleted.record) return;
    const original = lastDeleted.record;
    try {
      const nowIso = new Date().toISOString();
      // Restore the record by clearing deleted flags and bumping lastUpdated.
      await mergeRecord('opportunity', {
        ...original,
        deleted: false,
        deletedAt: null,
        lastUpdated: nowIso
      });
    } catch (err) {
      console.error('[SF CRM Extractor][Popup] Failed to undo delete', err);
    } finally {
      if (lastDeleted.timeoutId) {
        clearTimeout(lastDeleted.timeoutId);
      }
      setLastDeleted(null);
    }
  };

  const generateCSV = (records) => {
    if (!records || records.length === 0) return '';
    const header = [
      'salesforceId',
      'name',
      'accountName',
      'amount',
      'stage',
      'probability',
      'closeDate',
      'ownerName',
      'lastUpdated',
      'sourceUrl'
    ];

    const escape = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (/[",\n]/.test(str)) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const lines = [header.join(',')];
    records.forEach((r) => {
      const row = [
        r.salesforceId || '',
        r.name || '',
        r.accountName || '',
        r.amount ?? '',
        r.stage || '',
        r.probability ?? '',
        r.closeDate || '',
        r.ownerName || '',
        r.lastUpdated || '',
        r.sourceUrl || ''
      ].map(escape);
      lines.push(row.join(','));
    });

    return lines.join('\n');
  };

  const triggerDownload = (filename, mimeType, content) => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csv = generateCSV(filteredOpportunities);
    if (!csv) return;
    triggerDownload('opportunities.csv', 'text/csv', csv);
  };

  const handleExportJson = () => {
    const json = JSON.stringify(filteredOpportunities, null, 2);
    triggerDownload('opportunities.json', 'application/json', json);
  };

  const currentTab = activeTab; // Only one for now, but keeps structure extensible.

  return (
    <div className="w-[420px] min-h-[360px] bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">SF CRM Extractor</h1>
        <span className="text-[11px] text-slate-500 uppercase">beta</span>
      </header>

      <main className="p-3 space-y-3 flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExtract}
            disabled={isExtracting}
            className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isExtracting ? (
              <span className="flex items-center gap-1">
                <span className="h-3 w-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                <span>Extracting…</span>
              </span>
            ) : (
              'Extract Current Object'
            )}
          </button>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, account, owner, URL"
            className="flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {lastDeleted && lastDeleted.record && (
          <div className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-md border bg-amber-50 border-amber-200 text-amber-800">
            <span>
              Record deleted. You can undo this action for a short time.
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="inline-flex items-center rounded-sm border border-amber-400 px-1.5 py-0.5 text-[11px] font-medium bg-amber-100 hover:bg-amber-200"
            >
              Undo
            </button>
          </div>
        )}

        {extractStatus && (
          <div
            className={`text-[11px] px-2 py-1 rounded-md border ${
              extractStatus.status === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : extractStatus.status === 'pending'
                ? 'bg-slate-50 border-slate-200 text-slate-600'
                : extractStatus.status === 'timeout'
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {extractStatus.message}
          </div>
        )}

        <div className="border-b border-slate-200 flex items-center justify-between gap-2 text-[11px] font-medium text-slate-600 mt-1">
          <div className="flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-2 py-1 border-b-2 -mb-px ${
                  currentTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {currentTab === 'opportunities' && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center rounded-sm border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center rounded-sm border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
              >
                Export JSON
              </button>
            </div>
          )}
        </div>

        <section className="flex-1 flex flex-col gap-1 mt-1">
          {currentTab === 'opportunities' && (
            <>
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>Stored opportunities: {filteredOpportunities.length}</span>
              </div>
              <OpportunitiesList items={filteredOpportunities} onDelete={handleDelete} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;

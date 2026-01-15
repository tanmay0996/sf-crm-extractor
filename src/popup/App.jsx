import React from 'react';

function App() {
  return (
    <div className="w-96 min-h-[320px] bg-slate-50 text-slate-900 font-sans">
      <header className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">SF CRM Extractor</h1>
        <span className="text-[11px] text-slate-500 uppercase">beta</span>
      </header>

      <main className="p-4 space-y-4">
        <button
          type="button"
          className="w-full inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-50"
        >
          Extract Current Object
        </button>

        <section className="mt-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Extracted Records
          </h2>
          <div className="border border-dashed border-slate-300 rounded-md bg-white p-3 text-xs text-slate-500 h-40 overflow-auto flex items-center justify-center text-center">
            <p>
              No data extracted yet. Run an extraction from an eligible Salesforce page to see
              results here.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

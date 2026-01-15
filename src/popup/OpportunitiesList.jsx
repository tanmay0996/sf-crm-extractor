import React from 'react';

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
      value
    );
  } catch (e) {
    return String(value);
  }
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${value}%`;
}

function formatDate(value) {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString();
  } catch (e) {
    return value;
  }
}

function formatDateTime(value) {
  if (!value) return '-';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch (e) {
    return value;
  }
}

function OpportunitiesList({ items, onDelete }) {
  if (!items || items.length === 0) {
    return (
      <div className="border border-dashed border-slate-300 rounded-md bg-white p-4 text-xs text-slate-500 flex items-center justify-center text-center h-40">
        <p>
          No opportunities stored yet. Use "Extract Current Object" on an Opportunity detail page to populate this
          list.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-md bg-white overflow-hidden text-xs">
      <div className="max-h-64 overflow-auto">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Account</th>
              <th className="px-2 py-1 text-right">Amount</th>
              <th className="px-2 py-1">Stage</th>
              <th className="px-2 py-1 text-right">Prob.</th>
              <th className="px-2 py-1">Close Date</th>
              <th className="px-2 py-1">Last Updated</th>
              <th className="px-2 py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.salesforceId || item.sourceUrl} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-1 font-medium text-slate-800 max-w-[140px] truncate" title={item.name || ''}>
                  {item.name || '(no name)'}
                </td>
                <td className="px-2 py-1 max-w-[120px] truncate" title={item.accountName || ''}>
                  {item.accountName || '-'}
                </td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{formatCurrency(item.amount)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{item.stage || '-'}</td>
                <td className="px-2 py-1 text-right whitespace-nowrap">{formatPercent(item.probability)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{formatDate(item.closeDate)}</td>
                <td className="px-2 py-1 whitespace-nowrap" title={item.lastUpdated || ''}>
                  {formatDateTime(item.lastUpdated)}
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete && onDelete(item)}
                    className="inline-flex items-center rounded-sm border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                 >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default OpportunitiesList;

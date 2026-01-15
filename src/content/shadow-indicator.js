// Shadow DOM-based extraction status indicator injected into Salesforce pages.
// This is designed to be style-isolated from the host page.

(function () {
  const HOST_ID = 'sf-crm-extractor-indicator-host';

  if (window.SFCrmIndicator) {
    // Already initialized on this page.
    return;
  }

  function createHost() {
    let host = document.getElementById(HOST_ID);
    if (host) return host;
    host = document.createElement('div');
    host.id = HOST_ID;
    document.documentElement.appendChild(host);
    return host;
  }

  const host = createHost();
  const shadow = host.attachShadow({ mode: 'open' });

  const container = document.createElement('div');
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  container.style.position = 'fixed';
  container.style.top = '8px';
  container.style.right = '8px';
  container.style.zIndex = '2147483647';
  container.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  container.style.fontSize = '11px';
  container.style.color = '#0f172a';

  const pill = document.createElement('div');
  pill.style.display = 'inline-flex';
  pill.style.alignItems = 'center';
  pill.style.gap = '4px';
  pill.style.padding = '4px 8px';
  pill.style.borderRadius = '999px';
  pill.style.backgroundColor = 'rgba(15,23,42,0.9)';
  pill.style.color = 'white';
  pill.style.boxShadow = '0 4px 10px rgba(15,23,42,0.45)';

  const statusDot = document.createElement('span');
  statusDot.style.display = 'inline-block';
  statusDot.style.width = '8px';
  statusDot.style.height = '8px';
  statusDot.style.borderRadius = '999px';
  statusDot.style.backgroundColor = '#64748b';

  const statusText = document.createElement('span');
  statusText.textContent = 'Idle';

  const tooltip = document.createElement('span');
  tooltip.id = 'sf-crm-extractor-indicator-tooltip';
  tooltip.textContent = 'Detected Object: Opportunity';
  tooltip.style.marginLeft = '6px';
  tooltip.style.opacity = '0.75';

  const debugButton = document.createElement('button');
  debugButton.type = 'button';
  debugButton.textContent = 'Open Debug View';
  debugButton.style.marginLeft = '8px';
  debugButton.style.padding = '2px 6px';
  debugButton.style.fontSize = '10px';
  debugButton.style.borderRadius = '999px';
  debugButton.style.border = '1px solid rgba(148,163,184,0.7)';
  debugButton.style.backgroundColor = 'rgba(15,23,42,0.9)';
  debugButton.style.color = '#e5e7eb';
  debugButton.style.cursor = 'pointer';

  debugButton.addEventListener('click', () => {
    try {
      // Ask the background script to open a debug view tab for this extension.
      chrome.runtime.sendMessage({ type: 'OPEN_DEBUG_VIEW', objectType: 'opportunity' });
    } catch (err) {
      console.error('[SF CRM Extractor][Indicator] Failed to request debug view', err);
    }
  });

  pill.appendChild(statusDot);
  pill.appendChild(statusText);
  pill.appendChild(tooltip);
  pill.appendChild(debugButton);

  container.appendChild(pill);
  shadow.appendChild(container);

  let currentState = 'idle';
  let resetTimer = null;

  function applyStateVisuals(state) {
    currentState = state;
    clearTimeout(resetTimer);

    if (state === 'idle') {
      statusText.textContent = 'Idle';
      statusDot.style.backgroundColor = '#22c55e';
    } else if (state === 'extracting') {
      statusText.textContent = 'Extracting…';
      statusDot.style.backgroundColor = '#38bdf8';
    } else if (state === 'success') {
      statusText.textContent = 'Success ✓';
      statusDot.style.backgroundColor = '#22c55e';
      resetTimer = setTimeout(() => applyStateVisuals('idle'), 3000);
    } else if (state === 'error') {
      statusText.textContent = 'Error ⚠';
      statusDot.style.backgroundColor = '#f97316';
      resetTimer = setTimeout(() => applyStateVisuals('idle'), 3000);
    }
  }

  applyStateVisuals('idle');

  window.SFCrmIndicator = {
    setStatus(nextState) {
      applyStateVisuals(nextState || 'idle');
    }
  };
})();

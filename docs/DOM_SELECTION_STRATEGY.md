# DOM Selection Strategy for Salesforce Lightning

This document describes how the SF CRM Extractor content scripts select and extract field values from Salesforce
Lightning pages, with a focus on the **Opportunity** record detail view.

## 1. Selector fallback chain

The extractor uses a helper function `getFieldValue(selectorConfigs, labelFallbackText)` that implements a **fallback
chain** for locating field values:

1. **Data and structural selectors (preferred)**

   - Target Lightning-specific elements first, such as:
     - `records-record-layout-item[field-label="Opportunity Name"] ...`
     - elements with `data-output-element-id` attributes (e.g. `data-output-element-id*="Amount"`).
   - These selectors are typically resilient to minor layout changes because they rely on structured component
     attributes rather than raw CSS class names.

2. **ARIA / semantic hints**

   - Where available, attributes like `aria-label` or titles are used (for example, via generic selectors that include
     `[title]`).
   - These are especially useful for headers and record names.

3. **Label + value lookup (layout-aware)**

   - If no direct selector yields a value, the extractor falls back to searching for label text such as
     "Amount", "Stage", "Close Date", etc.
   - It scans for label-like nodes:

     ```js
     document.querySelectorAll('label, .slds-form-element__label, .slds-form-element__label span, [title]');
     ```

   - For each label whose normalized text contains the requested label (case-insensitive):
     - The code walks up to a parent container that matches typical Lightning form containers, such as:

       ```js
       .slds-form-element,
       .slds-form-element_horizontal,
       .test-id__field-label
       ```

     - Within that container, it searches for common value containers:

       ```js
       .slds-form-element__control,
       .slds-form-element__static,
       .slds-form-element__static span,
       .slds-form-element__static div,
       [data-output-element-id]
       ```

     - If no value is found inside the container, it falls back to the label's `nextElementSibling` as a last resort.

4. **XPath (future extension)**

   - The current implementation does **not** rely on hard-coded XPath expressions because they are brittle across
     layout changes.
   - If necessary, XPath-based selectors could be added as an additional layer in the fallback chain, but the primary
     strategy is to stay within CSS selectors and structural/label relationships in the DOM.

## 2. Examples for Opportunity fields

The Opportunity extractor lives in `src/content/extractors/opportunity-extractor.js`. For each field, it defines a
selector chain and a label fallback.

### 2.1 Opportunity Name

Preferred selectors:

- `records-record-layout-item[field-label="Opportunity Name"] lightning-formatted-text`
- `a[title][data-output-element-id*="RecordName"], a[title].slds-truncate`

Fallback label:

- `"Opportunity Name"` – looked up via the label + value strategy.

### 2.2 Amount

Preferred selectors:

- `records-record-layout-item[field-label="Amount"] lightning-formatted-number`
- `records-record-layout-item[field-label="Amount"] lightning-formatted-text`
- `[data-output-element-id*="Amount"]`

Fallback label:

- `"Amount"`

The extracted text is then normalized and passed through `parseAmount` which strips currency symbols and formatting
(e.g. commas) and converts to a numeric value.

### 2.3 Stage

Preferred selectors:

- `records-record-layout-item[field-label="Stage"] lightning-formatted-text`
- `[data-output-element-id*="StageName"]`

Fallback label:

- `"Stage"`

### 2.4 Probability

Preferred selectors:

- `records-record-layout-item[field-label="Probability"] lightning-formatted-number`
- `[data-output-element-id*="Probability"]`

Fallback label:

- `"Probability"`

The extracted text is passed through `parseProbability`, which strips non-numeric characters (such as `%`) and returns
an integer percentage where possible.

### 2.5 Close Date

Preferred selectors:

- `records-record-layout-item[field-label="Close Date"] lightning-formatted-date-time`
- `records-record-layout-item[field-label="Close Date"] lightning-formatted-text`
- `[data-output-element-id*="CloseDate"]`

Fallback label:

- `"Close Date"`

The extracted text is normalized and then converted into an ISO string via `parseDateToIso`.

## 3. MutationObserver + debounce

Salesforce Lightning pages are highly dynamic: much of the UI is rendered asynchronously after the initial HTML is
loaded, and components can re-render in response to user interactions, navigation inside the app, and background
updates.

To avoid brittle "wait X ms" logic, the extractor uses `MutationObserver` on `document.body` with a **debounce**:

- The observer is configured as:

  ```js
  observer.observe(document.body, { childList: true, subtree: true });
  ```

- On each mutation, a timer is (re)started. Only when there have been no further mutations for **300 ms** does the
  extractor run.
- This achieves two things:
  - **Resilience to async rendering** – the extractor waits until the DOM has settled before reading field values.
  - **Protection against over-running** – avoids running extraction on every tiny DOM update (which would be noisy and
    potentially expensive).

The observer is initialized once per page load and also triggers a first extraction when the DOM is ready
(`DOMContentLoaded` or `document.readyState` check).

## 4. Testing guidance

When testing or extending the DOM selection strategy, use a Salesforce **Developer Org** so you can:

- Safely modify page layouts and verify that the selector chains still work under common customizations.
- Inspect the generated DOM in Chrome DevTools (Elements panel) to:
  - Confirm the presence of `records-record-layout-item` components.
  - Identify data attributes like `data-output-element-id`.
  - Inspect label and value containers (`.slds-form-element__label`, `.slds-form-element__static`, etc.).

Recommended steps:

1. Log into a Salesforce Developer Org and open an **Opportunity** record in Lightning.
2. Open DevTools and inspect fields such as **Opportunity Name**, **Amount**, **Stage**, **Probability**, and
   **Close Date**.
3. Compare the DOM to the selectors defined in `opportunity-extractor.js`.
4. Trigger the extension's extraction logic (e.g. using the popup or `runOpportunityExtraction()` in the console).
5. Verify that the extracted JSON matches the values shown in the UI.
6. Try small layout tweaks (e.g. moving fields between sections) and confirm that the fallback chain still succeeds.

This strategy should provide a balance between robustness to minor DOM changes and avoiding overly brittle,
layout-specific selectors.

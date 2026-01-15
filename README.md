# SF CRM Extractor

Chrome extension scaffold for experimenting with extracting data from Salesforce CRM pages.

This project uses:

- **React + Vite** for the popup UI
- **Tailwind CSS** for styling the popup
- **Manifest V3** background service worker and content script (plain JavaScript)

## Project structure

- **manifest.json** – Chrome extension manifest (MV3)
- **src/background/service-worker.js** – background service worker
- **src/content/content-main.js** – content script injected into Salesforce pages
- **src/popup/** – React + Vite popup app
  - `index.html`
  - `main.jsx`
  - `App.jsx`
  - `index.css` (Tailwind entry)

The built popup is output to `dist/popup` by Vite. The `pack` script then assembles an extension-ready folder at `dist-extension/`.

## Getting started

### 1. Install dependencies

From the `sf-crm-extractor` directory:

```bash
npm install
```

### 2. Run popup in development

Start Vite dev server for the popup:

```bash
npm run dev
```

Vite will print a local URL (e.g. `http://localhost:5173`). You can open this in your browser to develop the popup UI.

> Note: During development, the Chrome extension itself is typically loaded from a built folder. Use `npm run build` and `npm run pack` to prepare that folder.

### 3. Build popup for production

Build the popup React app into `dist/popup`:

```bash
npm run build
```

### 4. Create an extension-ready folder

After building, assemble an unpacked extension folder at `dist-extension/`:

```bash
npm run pack
```

This folder contains:

- `manifest.json`
- `popup/` – built popup (React + Tailwind via Vite)
- `src/background/service-worker.js`
- `src/content/content-main.js`

### 5. Load the extension in Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `dist-extension` folder created by `npm run pack`.

You should now see the **SF CRM Extractor** extension in the toolbar. Click the icon to open the popup UI.

The content script is configured to run on:

- `https://*.lightning.force.com/*`
- `https://*.salesforce.com/*`

The service worker logs startup and listens for basic messages from the content script.

### 6. Manual end-to-end test for the popup

1. Load the unpacked extension from `dist-extension` as described above.
2. In Chrome, navigate to a Salesforce Lightning **Opportunity** record detail page.
3. Open the **SF CRM Extractor** popup from the toolbar.
4. Click **Extract Current Object**.
5. Wait a moment; the status message in the popup should report success.
6. The **Opportunities** tab in the popup should list the extracted record, including fields such as name, amount,
   stage, probability, close date, account name, and last updated.
7. Use the search box to filter by opportunity name or account name.
8. Click **Delete** on a row to remove it from storage; the list should update immediately.

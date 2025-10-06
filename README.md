## NotebookLM to Google Docs (WXT)

Steps to run:

1. Replace `REPLACE_WITH_OAUTH_CLIENT_ID.apps.googleusercontent.com` in `src/manifest.json` and `wxt.config.ts` with your Chrome Extension OAuth Client ID (type: Chrome Extension) from Google Cloud.
2. Ensure the extension ID in the OAuth client matches your local extension ID if you want to keep it stable. See Chrome docs for details.
3. Install deps and build:

```bash
npm install
npm run build
```

4. Load the `dist/` directory as an unpacked extension at `chrome://extensions`.

Usage:
- Open a tab on `notebooklm.google.com`. Select text or keep focus on a block. Open the extension popup and click "Export selection/block to Google Docs".

Auth and API follow Chrome Identity OAuth guidance from the Chrome docs: `https://developer.chrome.com/docs/extensions/how-to/integrate/oauth`.

## OAuth Setup

- Create an OAuth Client (Application type: Chrome Extension) in Google Cloud console and copy the Client ID.
- Paste it into `wxt.config.ts` under `oauth2.client_id`.
- Ensure `host_permissions` includes `https://notebooklm.google.com/*`.
- Follow Chrome Identity OAuth guidance: `https://developer.chrome.com/docs/extensions/how-to/integrate/oauth`.

## WXT Entrypoints

- Popup is defined at `entrypoints/popup.html` and loads code from `src/ui/popup.ts`.
- Background service worker is defined at `entrypoints/background.ts` using `defineBackground` (per `https://wxt.dev/guide/essentials/entrypoints.html`).

## Build & Load

```bash
npm run build
```

- Load `.output/chrome-mv3` as unpacked at `chrome://extensions`.

## Usage

- Navigate to `https://notebooklm.google.com/*`, select text or focus a block.
- Open the extension popup and click "Export selection/block to Google Docs".
- You will be prompted to sign in; the extension will create a Doc with the content.



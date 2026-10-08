# Slate Helper

A Chrome extension (Manifest V3) that improves the UI and UX of Technolutions Slate. It runs on any client's Slate instance, whatever the domain.

## Install (development)

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and pick this folder
4. After editing files, click the reload icon on the extension card, then refresh the Slate tab

There's no build step. The files are plain JS.

## How it works

The content scripts load on every http/https page. They stay idle unless the page looks like Slate.

**Detection** (`src/content/detect.js`) scores page fingerprints:

| Signal | Weight |
|---|---|
| Hostname is `*.technolutions.net` | 10 |
| Slate's `FW` JS framework is present (checked in the page's main world by `probe-main.js`) | 5 |
| Link to technolutions.com / .net | 3 |
| Path starts with `/manage`, `/apply`, `/portal`, `/register`, `/account` | 2 |
| Assets loaded from `/shared/` | 2 |

A score of 5 or more counts as Slate. Detection also sets an **area** from the path: `admin` (`/manage`), `apply`, `portal`, or `other`. Features can limit themselves to certain areas.

**Per-site override:** if detection gets a site wrong, open the popup and set the site to *Always on* or *Always off*.

When the extension is active, the toolbar icon shows an **ON** badge, and `<html>` gets the classes `slate-helper-active` and `slate-helper-area-<area>`.

## Layout

```
manifest.json
src/
  background.js              toolbar badge
  content/
    probe-main.js            MAIN-world probe for Slate's FW global
    core.js                  SlateHelper namespace, settings, feature registry, DOM/nav hooks
    detect.js                Slate detection + area
    features/                one file per feature
    main.js                  entry point; runs detection, starts features (must load last)
  popup/                     status, per-site override, feature toggles
```

## Adding a feature

1. Create `src/content/features/my-feature.js`:

   ```js
   (() => {
     const SH = globalThis.SlateHelper;
     SH.registerFeature({
       id: 'my-feature',
       name: 'My feature',
       description: 'What it does, shown in the popup.',
       defaultEnabled: true,
       areas: ['admin'],          // or '*'
       init(ctx) {                // ctx: { host, area, settings }
         SH.injectStyle('my-feature', `/* css */`);
         // Slate swaps content in place, so re-apply on DOM changes:
         SH.onDomChange(() => { /* idempotent DOM tweaks */ });
       },
     });
   })();
   ```

2. Add the file to the `js` list in `manifest.json`, **before** `src/content/main.js`.

Make `onDomChange` callbacks idempotent. They run after every DOM mutation, at most once per animation frame.

## Settings

Settings are stored in `chrome.storage.sync`, so they follow your Chrome profile:

```js
{ siteOverrides: { "host": "on" | "off" }, features: { "id": true | false }, debug: false }
```

To turn on console logging, run this from the extension's service worker console:
`chrome.storage.sync.set({ debug: true })`

# Slate Helper

A Chrome extension (Manifest V3) that improves the UI and UX of Technolutions Slate. It runs on any client's Slate instance, whatever the domain.

## Install (development)

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and pick this folder

There's no build step. The files are plain JS.

**Auto-reload:** for unpacked installs, each time a Slate page loads, the extension checks whether its files changed since it was loaded. If they did, it reloads itself and then reloads every open Slate tab (a reload disconnects the extension from all of them). So after editing, just reload a Slate page. If Chrome rejects a manifest change, the extension stops loading; fix it and use the reload button on `chrome://extensions`.

## Features

All are on by default and can be switched off in the toolbar popup.

| Feature | What it does |
|---|---|
| Instance badge | Corner badge with the hostname and Slate area |
| Client favicon in header | The instance's favicon left of the Slate logo (skipped if it's Slate's default icon) |
| Double-click to pick | Query builder: double-click an export or filter to select it and continue |
| Editor dialog size | Dialogs never wider than the window; WYSIWYG editor dialogs open at 85% of the window height |
| Keep editor open after Save | Save / Ctrl+S in an editor dialog saves without closing it |
| Link dialog shortcuts | "Open in new tab" button; Tab from the URL field opens the Target tab |
| Source view: indentation | Tab = 2 spaces, Backspace removes an indent level, Enter between tags splits and indents, pastes re-indent |
| Source view: auto-close pairs | `( [ { " '` auto-close; quotes only in code (tags, `<style>`, `<script>`, Liquid) |
| Source view: autocomplete | HTML tags, attribute snippets, Liquid keywords, filters and variables |
| Source view: find & replace | Find/Replace toolbar buttons work in source view; Ctrl+H replaces |
| Source view: highlight current element | Shades the element the cursor is in |

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

### Two worlds

Content scripts normally run in an *isolated world*: they share the page's DOM but can't see its JavaScript objects. Features that only touch the DOM run there (`src/content/`). Features that need Slate's own objects (CKEditor, CodeMirror, `FW`) run in the page's *MAIN world* (`src/page/`).

The isolated world owns detection and settings. Once it decides the page is Slate, it writes the enabled page-world feature ids to `<html data-slate-helper-config>` and fires `slate-helper:activate`; `src/page/runtime.js` picks that up and starts those features.

## Layout

```
manifest.json
src/
  background.js                toolbar badge, dev auto-reload
  content/                     isolated world
    probe-main.js              (runs in MAIN world) probe for Slate's FW global
    core.js                    SlateHelper namespace, settings, feature registry, DOM/nav hooks
    detect.js                  Slate detection + area
    features/                  DOM-only features
    page-features.js           popup/settings metadata for the page-world features
    main.js                    entry point; detection, starts features, hands off to page world (loads last)
  page/                        MAIN world
    runtime.js                 SlateHelperPage namespace, element watcher, activation
    cm-utils.js                CodeMirror/CKEditor helpers
    features/                  features that use CKEditor / CodeMirror / FW
    boot.js                    starts the page runtime (loads last)
  popup/                       status, per-site override, feature toggles
```

## Adding a feature

**DOM-only feature** — create `src/content/features/my-feature.js` and add it to the isolated-world `js` list in `manifest.json`, before `src/content/main.js`:

```js
(() => {
  const SH = globalThis.SlateHelper;
  SH.registerFeature({
    id: 'my-feature',
    name: 'My feature',
    description: 'What it does, shown in the popup.',
    defaultEnabled: true,
    areas: ['admin'],          // or '*'
    init(ctx) {                // ctx: { host, area, settings }; may be async
      SH.injectStyle('my-feature', `/* css */`);
      // Slate swaps content in place, so re-apply on DOM changes:
      SH.onDomChange(() => { /* idempotent DOM tweaks */ });
    },
  });
})();
```

**Page-world feature** — add its metadata to `src/content/page-features.js`, then create `src/page/features/my-feature.js` and add it to the MAIN-world `js` list, before `src/page/boot.js`:

```js
(() => {
  const SHP = window.SlateHelperPage;
  SHP.registerFeature('my-feature', () => {
    SHP.onCodeMirror((cm) => { /* every source-view editor */ });
    SHP.onCKEditor((editor) => { /* every CKEditor, once ready */ });
    SHP.onAdded('.dialog_host', (el) => { /* every new matching element */ });
  });
})();
```

Make `onDomChange` callbacks idempotent. They run (debounced) after DOM mutations. Use timers rather than `requestAnimationFrame` for this kind of work: rAF doesn't run in hidden tabs.

## Settings

Settings are stored in `chrome.storage.sync`, so they follow your Chrome profile:

```js
{ siteOverrides: { "host": "on" | "off" }, features: { "id": true | false }, debug: false }
```

To turn on console logging, run this from the extension's service worker console:
`chrome.storage.sync.set({ debug: true })`

# Slate Helper

A Chrome extension (Manifest V3) that improves the UI and UX of Technolutions Slate. It runs on any client's Slate instance, whatever the domain.

## Install

1. Download `slate-helper-<version>.zip` from [Releases](https://github.com/nickesc-wb/slate-helper-browser-ext/releases) and unzip it somewhere it can stay (or, to work on it, clone this repo)
2. Open `chrome://extensions` and turn on **Developer mode**
3. Click **Load unpacked** and pick the folder

Chrome won't install packaged extensions from outside the Chrome Web Store, so the extension is loaded unpacked and doesn't auto-update. When a new release is out, Slate pages show a notice in the bottom-right corner. To update, replace the folder's contents with the new release and click the reload button on `chrome://extensions`.

## Features

All are on by default and can be switched off in the toolbar popup, grouped by section. Most have sub-options, so individual behaviors can be switched off too.

| Feature | What it does |
|---|---|
| Client favicon in header | The instance's favicon left of the Slate logo, in both the desktop and compact header (skipped if it's Slate's default icon) |
| Double-click to pick | Query builder: double-click an export or filter to select it and continue |
| Dialog size | Dialogs stay inside the window; editor dialogs open at 85% of the window height; drag any edge or corner to resize |
| Keep editor open after Save | Save / Ctrl+S in an editor dialog saves without closing it |
| Link dialog shortcuts | "Open in new tab" button; Tab from the URL field opens the Target tab |
| Source view: indentation | Tab = 2 spaces, Backspace removes an indent level, Enter between tags splits and indents, pastes re-indent; turns off Slate's split-on-type for block tags |
| Source view: auto-close pairs | `( [ { " '` auto-close; quotes only in code (tags, `<style>`, `<script>`, Liquid) |
| Source view: autocomplete | HTML tags, attribute snippets, Liquid keywords, filters and variables |
| Source view: find & replace | Find/Replace toolbar buttons work in source view; Ctrl+H replaces |
| Source view: highlight current element | Shades the element the cursor is in |
| Source view: check Liquid tags | Underlines `{% if %}`, `{% for %}` etc. with no end tag (and their `{% elsif %}` / `{% else %}` / `{% when %}`), end tags with nothing to close, and `{% else %}` / `{% when %}` outside their block; hover for details |
| Update notice | A notice in the bottom-right corner when a newer release is on GitHub, linking to it |

## Development

<details>
<summary>How it works, adding features, tests and releases</summary>

### How it works

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

When the extension is active, the toolbar icon shows a small green dot, and `<html>` gets the classes `slate-helper-active` and `slate-helper-area-<area>`.

**Auto-reload:** for unpacked installs, each time a Slate page loads, the extension checks whether its files changed since it was loaded. If they did, it reloads itself and then reloads that tab. Other open tabs are left alone (they might have unsaved work) and stay disconnected until refreshed; the popup offers a Reload button. So after editing, just reload a Slate page. If Chrome rejects a manifest change, the extension stops loading; fix it and use the reload button on `chrome://extensions`.


#### Two worlds

Content scripts normally run in an *isolated world*: they share the page's DOM but can't see its JavaScript objects. Features that only touch the DOM run there (`src/content/`). Features that need Slate's own objects (CKEditor, CodeMirror, `FW`) run in the page's *MAIN world* (`src/page/`).

The isolated world owns detection and settings. Once it decides the page is Slate, it writes the enabled page-world feature ids to `<html data-slate-helper-config>` and fires `slate-helper:activate`; `src/page/runtime.js` picks that up and starts those features.

### Layout

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

### Adding a feature

**DOM-only feature** — create `src/content/features/my-feature.js` and add it to the isolated-world `js` list in `manifest.json`, before `src/content/main.js`:

```js
(() => {
  const SH = globalThis.SlateHelper;
  SH.registerFeature({
    id: 'my-feature',
    name: 'My feature',
    group: 'Dialogs',          // popup section (see SH.GROUPS in core.js)
    description: 'What it does, shown in the popup.',
    defaultEnabled: true,
    areas: ['admin'],          // or '*'
    options: [{ id: 'part', name: 'One part of it', defaultEnabled: true }],
    init(ctx) {                // ctx: { host, area, settings, option(id) }; may be async
      if (!ctx.option('part')) return;
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
    if (!SHP.option('my-feature', 'part')) return; // options, as declared in page-features.js
    SHP.onCodeMirror((cm) => { /* every source-view editor */ });
    SHP.onCKEditor((editor) => { /* every CKEditor, once ready */ });
    SHP.onAdded('.dialog_host', (el) => { /* every new matching element */ });
  });
})();
```

Make `onDomChange` callbacks idempotent. They run (debounced) after DOM mutations. Use timers rather than `requestAnimationFrame` for this kind of work: rAF doesn't run in hidden tabs.

### Tests

```bash
npm install
npm test
```

Tests use [Vitest](https://vitest.dev) with jsdom, a simulated browser page in Node. Nothing runs against a real Slate instance. Each test loads the extension's scripts into the page the way Chrome does. Source-view features are tested against CodeMirror 5 from npm, set up like Slate's editor (htmlmixed with Liquid multiplexed in); see `test/helpers/codemirror.js`. In test strings, `‸` marks the cursor (`|` is Liquid's filter pipe).

`test/manifest.test.js` checks that `manifest.json` lists every feature file in the right order and that each page feature has popup metadata in `src/content/page-features.js`.

The tooling (`package.json`, `node_modules/`, `test/`) is for development only and isn't part of the released extension.

### Releasing

Day-to-day work happens on `dev`. To release:

1. Bump `"version"` in `manifest.json` on `dev`
2. Merge `dev` into `main` and push

On every push to `main`, the Release workflow checks whether `v<version>` from `manifest.json` has been released yet. If it hasn't, it runs the tests, zips `manifest.json`, `icons/` and `src/`, tags the commit `v<version>`, and publishes a GitHub Release with the zip. A push to `main` without a version bump releases nothing. If the tests fail, nothing is released; fix them and push again.

The Test workflow runs the tests on every push to `main` and `dev` and on pull requests.

### Settings

Settings are stored in `chrome.storage.sync`, so they follow your Chrome profile:

```js
{ siteOverrides: { "host": "on" | "off" }, features: { "id": true | false, "id.option": true | false }, debug: false }
```

To turn on console logging, run this from the extension's service worker console:
`chrome.storage.sync.set({ debug: true })`

</details>

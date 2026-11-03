# Slate Helper

A Chrome extension (Manifest V3) that improves the UI and UX of Technolutions Slate. It runs on any client's Slate instance, whatever the domain.

## Install

1. Download `slate-helper-<version>.zip` from [Releases](https://github.com/nickesc-wb/slate-helper-browser-ext/releases) and unzip it somewhere it can stay (or, to work on it, clone this repo)
2. Open `chrome://extensions` and turn on **Developer mode**
3. Click **Load unpacked** and pick the folder

Chrome won't install packaged extensions from outside the Chrome Web Store, so the extension is loaded unpacked and doesn't auto-update. When a new release is out, Slate pages show a notice in the bottom-right corner.

### Updating

**One click (Windows):** double-click `updater\install.cmd` in the extension folder once. It sets up a small helper for your Windows user (no admin rights needed) that Chrome, Brave and Edge can call. From then on, the update notice has an **Update now** button that downloads the new release over the folder and reloads the extension and the page. Run `install.cmd` again if you move the folder; `install.cmd -Uninstall` removes the helper. The helper never touches a git clone: update those with `git pull`.

**By hand:** replace the folder's contents with the new release and click the reload button on `chrome://extensions`.

## Features

All are on by default and can be switched off in the toolbar popup, which has a tab per section. Most have sub-options, so individual behaviors can be switched off too.

| Feature | What it does |
|---|---|
| Client favicon in header | The instance's favicon left of the Slate logo, in both the desktop and compact header (skipped if it's Slate's default icon) |
| Double-click to pick | Query builder: double-click an export or filter to select it and continue |
| Dialog size | Dialogs stay inside the window; editor dialogs open at 85% of the window height; drag any edge or corner to resize |
| Keep editor open after Save | Save / Ctrl+S in an editor dialog saves without closing it |
| Link dialog shortcuts | "Open in new tab" button; Tab from the URL field opens the Target tab |
| Delete registrations in one step | A Delete button in a form response's popup on the Registered tab cancels and then deletes it, so you don't have to switch to the Cancelled tab and reopen it |
| Impersonate on pick | Impersonate dialogs: picking a record from the lookup impersonates it, no need to press Impersonate or Ctrl+S |
| Source view: indentation | Tab = 2 spaces, Backspace removes an indent level, Enter between tags splits and indents, pastes re-indent; turns off Slate's split-on-type for block tags |
| Source view: auto-close pairs | `( [ { " '` auto-close; quotes only in code (tags, `<style>`, `<script>`, Liquid) |
| Source view: autocomplete | HTML tags, attribute snippets, Liquid keywords, filters and variables; in `<style>`, CSS properties and values with their MDN docs beside the list |
| Source view: find & replace | Find/Replace toolbar buttons work in source view; Ctrl+H replaces |
| Source view: highlight current element | Shades the element the cursor is in; inside `<style>`, the innermost CSS rule (nested rules and `@media` blocks count separately) |
| Source view: triple-click selects element text | Triple-clicking text selects everything inside the innermost element around it but not that element's tags, even on one line (`<p>‸text‸</p>`). Inline elements count too: triple-clicking inside `<strong>` selects the `<strong>`'s text. Outer whitespace is left out. Triple-clicking an attribute's value selects the value without its quotes (`style="‸color: red;‸"`). Elsewhere on a tag, in `<style>`/`<script>` or between tags, it selects the line as usual |
| Source view: lint | Underlines HTML tags that don't pair up, duplicate attributes and empty `src` (HTMLHint), CSS syntax errors, unknown properties and empty rules in `<style>` (VS Code's CSS checks), and JavaScript errors in `<script>` (JSHint); hover for details. Liquid is skipped |
| Source view: hover docs | Rest the mouse on an HTML tag or attribute, or a CSS property or value, for its MDN docs, shown just above the line. Three detail levels: compact (first sentence, support status and MDN link), standard (compact plus the CSS syntax line; the default) and verbose (everything); up/down buttons in the corner step between the levels a box has (up for more detail, verbose at the top). Description, browser support (Baseline), CSS syntax, selector specificity and links can each be hidden. The suggestion list's docs follow the same settings |
| Source view: check Liquid tags | Underlines `{% if %}`, `{% for %}` etc. with no end tag (and their `{% elsif %}` / `{% else %}` / `{% when %}`), end tags with nothing to close, and `{% else %}` / `{% when %}` outside their block; hover for details |
| Update notice | A notice in the bottom-right corner when a newer release is on GitHub, linking to it; with the updater installed, **Update now** installs it |

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

**Per-site override:** if detection gets a site wrong, open the popup and set *This site* to *On* or *Off* (*Auto* goes back to detection).

When the extension is active, the toolbar icon shows a small green dot, and `<html>` gets the classes `slate-helper-active` and `slate-helper-area-<area>`.

**Auto-reload:** for unpacked installs, each time a Slate page loads, the extension checks whether its files changed since it was loaded. If they did, it reloads itself and then reloads that tab. Other open tabs are left alone (they might have unsaved work) and stay disconnected until refreshed; the popup offers a Reload button. So after editing, just reload a Slate page. If Chrome rejects a manifest change, the extension stops loading; fix it and use the reload button on `chrome://extensions`.


#### Two worlds

Content scripts normally run in an *isolated world*: they share the page's DOM but can't see its JavaScript objects. Features that only touch the DOM run there (`src/content/`). Features that need Slate's own objects (CKEditor, CodeMirror, `FW`) run in the page's *MAIN world* (`src/page/`).

The isolated world owns detection and settings. Once it decides the page is Slate, it writes the enabled page-world feature ids to `<html data-slate-helper-config>` and fires `slate-helper:activate`; `src/page/runtime.js` picks that up and starts those features.

#### On-demand libraries

Lint, hover docs and CSS autocomplete use VS Code's CSS and HTML language services (the same MDN-derived data VS Code shows), HTMLHint and JSHint. Together they're about 2 MB, too much to load into every page, so they're bundled into `src/vendor/source-tools.js` and loaded only when a page feature asks: `SHP.load('source-tools')` fires `slate-helper:load`, `main.js` (isolated world) checks the name against `SH.VENDOR_SCRIPTS` and asks the background, which injects the file into that frame's MAIN world with `chrome.scripting` (hence the `scripting` permission). The script hands its exports over with `SHP.provide`. Features call `SHP.cm.loadTools()` when the first editor opens; `SHP.cm` also has the helpers that give the tools Liquid-masked, same-length copies of the template.

The bundle is built by `tools/build-vendor.mjs` (`npm run vendor`) and committed, so the extension itself still has no build step. Rebuild it after upgrading any of those packages.

### Layout

```
manifest.json
src/
  background.js                toolbar badge, dev auto-reload, release check, updater calls
  content/                     isolated world
    probe-main.js              (runs in MAIN world) probe for Slate's FW global
    core.js                    SlateHelper namespace, settings, feature registry, DOM/nav hooks
    detect.js                  Slate detection + area
    features/                  DOM-only features
    page-features.js           popup/settings metadata for the page-world features
    main.js                    entry point; detection, starts features, hands off to page world (loads last)
  page/                        MAIN world
    runtime.js                 SlateHelperPage namespace, element watcher, activation, on-demand loading
    cm-utils.js                CodeMirror/CKEditor helpers, Liquid masking, hover tooltip
    features/                  features that use CKEditor / CodeMirror / FW
    boot.js                    starts the page runtime (loads last)
  popup/                       status, per-site override, feature toggles (a tab per group)
  vendor/source-tools.js       generated bundle of the language tools, loaded on demand
tools/                         build script for src/vendor/ (dev only)
updater/                       Windows updater: native messaging host + installer (shipped in the zip)
```

#### Updater

An extension can't write to its own folder, so one-click updates go through a [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) host (hence the `nativeMessaging` permission). `updater/install.ps1` (run through `install.cmd`) copies `host.ps1`/`host.cmd` to `%LOCALAPPDATA%\SlateHelper\updater` with a `config.json` naming the extension folder, writes the host manifest `com.waybetter.slate_helper.json` there, and registers it under HKCU in Chrome's, Chromium's and Brave's keys (Chromium-based browsers read Chrome's or Chromium's; Brave's binary names both) and Edge's. The manifest only allows this folder's extension ID, which the installer computes the way Chrome names unpacked extensions: SHA-256 of the folder path (UTF-16, drive letter upper-cased), first 32 hex digits mapped `0-f` to `a-p`.

The background talks to it with `chrome.runtime.sendNativeMessage`: `slate-helper:updater` pings it (the toast shows **Update now** only if it answers and the folder isn't a git checkout) and `slate-helper:update` asks it to update. The host downloads the latest release's zip, mirrors `icons/`, `src/` and `updater/` into the folder (robocopy `/MIR`, so removed files go too), copies `manifest.json` last, and refreshes its own copy of `host.ps1`. The background then reloads the extension and the tab that asked (the dev auto-reload's `devReloadTab` hand-off). In a git checkout the host refuses and leaves the folder alone.

The scripts target Windows PowerShell 5.1 (`powershell.exe`), and the host must write nothing to stdout but its reply. `.gitattributes` keeps `*.cmd`/`*.ps1` at CRLF so the zip built on Linux still has Windows line endings. To try the host without the browser, send it a length-prefixed JSON message (`{"type":"ping"}`) on stdin, the way Chrome does.

### Adding a feature

**DOM-only feature** — create `src/content/features/my-feature.js` and add it to the isolated-world `js` list in `manifest.json`, before `src/content/main.js`:

```js
(() => {
  const SH = globalThis.SlateHelper;
  SH.registerFeature({
    id: 'my-feature',
    name: 'My feature',
    group: 'Dialogs',          // popup tab (see SH.GROUPS in core.js)
    description: 'What it does, shown in the popup.',
    defaultEnabled: true,
    areas: ['admin'],          // or '*'
    options: [               // checkboxes, or a select when it has choices
      { id: 'part', name: 'One part of it', defaultEnabled: true },
      { id: 'size', name: 'Size', choices: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }], defaultValue: 's' },
    ],
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

Tests use [Vitest](https://vitest.dev) with jsdom, a simulated browser page in Node. Nothing runs against a real Slate instance. Each test loads the extension's scripts into the page the way Chrome does. Source-view features are tested against CodeMirror 5 from npm, set up like Slate's editor (htmlmixed with Liquid multiplexed in); see `test/helpers/codemirror.js` (`provideSourceTools()` hands the page the vendor bundle, as the background would). In test strings, `‸` marks the cursor (`|` is Liquid's filter pipe).

`test/manifest.test.js` checks that `manifest.json` lists every feature file in the right order and that each page feature has popup metadata in `src/content/page-features.js`. `test/popup.test.js` opens the popup against a stubbed `chrome.*`.

The popup shows detection and the per-site override above a row of tabs, one per group in `SH.GROUPS` that has features (plus *Other* for features without a known group). Long group names get a shorter tab label from `TAB_LABELS` in `src/popup/popup.js`; add one there if a new group would make the tabs wrap. The last-opened tab and which features show their options are remembered in the popup's `localStorage`.

The tooling (`package.json`, `node_modules/`, `test/`, `tools/`) is for development only and isn't part of the released extension.

### Releasing

Day-to-day work happens on `dev`. To release:

1. Bump `"version"` in `manifest.json` on `dev`
2. Merge `dev` into `main` and push

On every push to `main`, the Release workflow checks whether `v<version>` from `manifest.json` has been released yet. If it hasn't, it runs the tests, zips `manifest.json`, `icons/`, `src/` and `updater/`, tags the commit `v<version>`, and publishes a GitHub Release with the zip. A push to `main` without a version bump releases nothing. If the tests fail, nothing is released; fix them and push again.

The Test workflow runs the tests on every push to `main` and `dev` and on pull requests.

### Settings

Settings are stored in `chrome.storage.sync`, so they follow your Chrome profile:

```js
{ siteOverrides: { "host": "on" | "off" }, features: { "id": true | false, "id.option": true | false | "choice value" }, debug: false }
```

To turn on console logging, run this from the extension's service worker console:
`chrome.storage.sync.set({ debug: true })`

</details>

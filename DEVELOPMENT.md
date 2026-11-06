# Developing Slate Helper

How the extension works, how to add a feature, and how to test and release it. For installing and using it, see the [README](README.md).

## Setup

1. Clone the repo.
2. Run `npm install`.
3. Load the folder unpacked: `chrome://extensions`, **Developer mode**, **Load unpacked**.

The extension has no build step. Chrome loads `manifest.json`, `icons/` and `src/` as they are. `package.json`, `node_modules/`, `test/` and `tools/` are dev tooling and aren't released.

After editing, reload a Slate page. An unpacked copy checks on each Slate page load whether its files changed, and if they did, it reloads itself and that tab. Other open tabs stay disconnected until you refresh them (they might have unsaved work); the popup offers a Reload button. If Chrome rejects a manifest change, the extension stops loading: fix it and click reload on `chrome://extensions`.

To log to the console, run `chrome.storage.sync.set({ debug: true })` in the extension's service worker console.

## Layout

```
manifest.json
src/
  background.js                toolbar icon, dev auto-reload, release check, updater calls
  content/                     isolated world
    probe-main.js              (runs in MAIN world) checks for Slate's FW global
    core.js                    SlateHelper namespace, settings, feature registry, DOM/nav hooks
    detect.js                  Slate detection + area
    features/                  DOM-only features
    page-features.js           popup metadata for the page-world features
    main.js                    entry point: detection, starts features, hands off to page world (loads last)
  page/                        MAIN world
    runtime.js                 SlateHelperPage namespace, element watcher, activation, on-demand loading
    cm-utils.js                CodeMirror/CKEditor helpers, Liquid masking, hover tooltip
    features/                  features that use CKEditor / CodeMirror / FW
    boot.js                    starts the page runtime (loads last)
  popup/                       status, per-site override, feature toggles (a tab per group)
  vendor/source-tools.js       generated bundle of the language tools, loaded on demand
tools/                         build script for src/vendor/ (dev only)
updater/                       Windows updater: native messaging host + installer (in the release zip)
                               and get.ps1, the one-line install (served from main)
```

## How it works

### Detection

The content scripts load on every http/https page and stay idle unless the page looks like Slate. `src/content/detect.js` scores the page:

| Signal | Weight |
|---|---|
| Hostname is `*.technolutions.net` | 10 |
| Slate's `FW` framework is present (checked in the MAIN world by `probe-main.js`) | 5 |
| Link to technolutions.com / .net | 3 |
| Path starts with `/manage`, `/apply`, `/portal`, `/register`, `/account` | 2 |
| Assets loaded from `/shared/` | 2 |

A score of 5 or more counts as Slate. Detection also sets an **area** from the path: `admin` (`/manage`), `apply`, `portal` or `other`. Features can limit themselves to areas.

The popup's *This site* setting overrides detection per host (*Auto* goes back to it). When the extension is active, the toolbar icon gets a green dot and `<html>` gets the classes `slate-helper-active` and `slate-helper-area-<area>`.

### Two worlds

Content scripts run in an *isolated world*: they share the page's DOM but can't see its JavaScript objects. DOM-only features run there (`src/content/`). Features that need Slate's objects (CKEditor, CodeMirror, `FW`) run in the page's *MAIN world* (`src/page/`).

The isolated world owns detection and settings. Once it decides the page is Slate, it writes the enabled page-world feature ids and options to `<html data-slate-helper-config>` and fires `slate-helper:activate`. `src/page/runtime.js` picks that up and starts those features.

### On-demand libraries

Lint, hover docs and CSS autocomplete use VS Code's CSS and HTML language services, HTMLHint and JSHint. Together they're about 2 MB, so they live in `src/vendor/source-tools.js` and load only when a page feature asks:

1. A feature calls `SHP.load('source-tools')` (features use `SHP.cm.loadTools()` when the first editor opens), which fires `slate-helper:load`.
2. `main.js` checks the name against `SH.VENDOR_SCRIPTS` and messages the background.
3. The background injects the file into that frame's MAIN world with `chrome.scripting` (hence the `scripting` permission).
4. The bundle hands its exports over with `SHP.provide`.

The tools don't know Liquid, so `SHP.cm` gives them same-length copies of the template with Liquid masked.

`tools/build-vendor.mjs` builds the bundle (`npm run vendor`). It's committed, so the extension still has no build step. Rebuild it after upgrading any of those packages.

### Updater

An extension can't write to its own folder, so one-click updates go through a [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) host (hence the `nativeMessaging` permission).

`updater/install.ps1` (run through `install.cmd`):

1. Copies `host.ps1` and `host.cmd` to `%LOCALAPPDATA%\SlateHelper\updater`, with a `config.json` naming the extension folder.
2. Writes the host manifest `com.waybetter.slate_helper.json` there, allowing only this folder's extension ID.
3. Registers it under HKCU in Chrome's, Chromium's, Brave's and Edge's `NativeMessagingHosts` keys. Brave's binary names both Chrome's and Chromium's.

The installer computes the ID the way Chrome names unpacked extensions: SHA-256 of the folder path (UTF-16, drive letter upper-cased), first 32 hex digits mapped `0-f` to `a-p`.

The background talks to the host with `chrome.runtime.sendNativeMessage`:

- `slate-helper:updater` pings it. The update notice shows **Update now** only if the host answers and the folder isn't a git checkout.
- `slate-helper:update` asks it to update. The host downloads the latest release zip, mirrors `icons/`, `src/` and `updater/` into the folder (robocopy `/MIR`, so removed files go too), copies `manifest.json` last and refreshes its own `host.ps1`. The background then reloads the extension and the tab that asked.

The host refuses to update a git checkout.

`updater/get.ps1` is the README's one-line install (`irm …/main/updater/get.ps1 | iex`). It downloads the latest release to `%USERPROFILE%\Slate Helper` (or `$env:SLATE_HELPER_DIR`), runs `install.ps1` and copies the path. The command fetches it from `main`, so changes to it go live on push, without a release. It can't open the browser's extensions page: browsers ignore `chrome://` and `brave://` URLs passed in by other programs.

Notes:

- The scripts target Windows PowerShell 5.1 (`powershell.exe`).
- The host must write nothing to stdout except its reply.
- `.gitattributes` keeps `*.cmd` and `*.ps1` at CRLF so the zip built on Linux has Windows line endings.
- To try the host without a browser, send it a length-prefixed JSON message (`{"type":"ping"}`) on stdin, the way Chrome does.

### Settings

Settings live in `chrome.storage.sync`, so they follow the browser profile:

```js
{ siteOverrides: { "host": "on" | "off" }, features: { "id": true | false, "id.option": true | false | "choice value" }, debug: false }
```

Per-browser data lives in `chrome.storage.local` instead:

- `dismissedRelease`: the release version whose update notice was closed (`update-toast`).
- `impersonateRecents`: `{ "host": { "<scope>": [{ id, name, lines }] } }`, every record impersonated per Slate instance, most recent first, with no cap (about 150 bytes each, far under the 10 MB `storage.local` quota) (`impersonate-recents`). The scope is the Impersonate dialog's hidden `type` input (`person`, `application`, ...), so a dialog only offers records of its own kind. A record is added when Impersonate is pressed; `name` and `lines` (Ref, Major, DOB...) come from the lookup's dropdown item (`.suggest_item[data-id]`).

## Adding a feature

### DOM-only feature

1. Create `src/content/features/my-feature.js`.
2. Add it to the isolated-world `js` list in `manifest.json`, before `src/content/main.js`.

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

### Page-world feature

1. Add its metadata to `src/content/page-features.js`.
2. Create `src/page/features/my-feature.js`.
3. Add it to the MAIN-world `js` list in `manifest.json`, before `src/page/boot.js`.

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

### Rules

- Make `onDomChange` callbacks idempotent. They run, debounced, after DOM mutations.
- Use timers, not `requestAnimationFrame`, for that kind of work: rAF doesn't run in hidden tabs.
- The popup shows one tab per group in `SH.GROUPS` that has features (plus *Other* for features without a known group). If a new group's name would make the tabs wrap, give it a shorter label in `TAB_LABELS` in `src/popup/popup.js`.

## Tests

```bash
npm test
```

- Tests use [Vitest](https://vitest.dev) with jsdom. Nothing runs against a real Slate instance.
- Each test loads the extension's scripts into the page the way Chrome does.
- Source-view features run against CodeMirror 5 from npm, set up like Slate's editor (htmlmixed with Liquid multiplexed in). See `test/helpers/codemirror.js`; `provideSourceTools()` hands the page the vendor bundle, as the background would.
- In test strings, `‸` marks the cursor (`|` is Liquid's filter pipe).
- `test/manifest.test.js` checks that `manifest.json` lists every feature file in order and that each page feature has popup metadata.
- `test/popup.test.js` opens the popup against a stubbed `chrome.*`.

The Test workflow runs the tests on every push to `main` and `dev` and on pull requests.

## Releasing

Work happens on `dev`. To release:

1. Bump `"version"` in `manifest.json` on `dev`.
2. Merge `dev` into `main`.
3. Push both.

On a push to `main`, the Release workflow checks whether `v<version>` exists. If it doesn't, the workflow runs the tests, zips `manifest.json`, `icons/`, `src/` and `updater/`, tags the commit and publishes a GitHub Release with the zip.

- A push to `main` without a version bump releases nothing.
- If the tests fail, nothing is released. Fix them and push again.
- Installed copies see the update notice once the release exists.

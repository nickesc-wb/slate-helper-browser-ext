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
  vendor/source-tools.js       generated bundle of the HTML/CSS language tools, loaded on demand
  vendor/js-tools.js           generated bundle of the JavaScript language service, loaded on demand
  vendor/format-tools.js       generated bundle of Prettier and its Liquid plugin, loaded on demand
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

The language tools are too big to load into every page, so they live in `src/vendor/` and load only when a page feature asks:

- `source-tools.js` (about 2 MB): VS Code's CSS and HTML language services, HTMLHint and JSHint, for lint, HTML/CSS hover docs and CSS autocomplete. Features load it with `SHP.cm.loadTools()` when an editor opens.
- `js-tools.js` (about 7 MB): TypeScript's language service with the DOM, ES2023 and jQuery 3 type definitions, for JavaScript suggestions and hover docs. The definitions' comments are where the docs and MDN links come from. Features load it with `SHP.cm.loadJsTools()`, only for an editor that has a `<script>` or once someone types in one, and it then answers a first query right away, since that one reads all the definitions (a few hundred ms).
- `format-tools.js` (about 1 MB): Prettier with Shopify's Liquid plugin (`@shopify/prettier-plugin-liquid`, which parses HTML with Liquid and formats `<style>` and `<script>` through Prettier's CSS and JavaScript parsers). `source-format` loads it the first time someone formats.

Loading works the same for all of them:

1. A feature calls `SHP.load(name)`, which fires `slate-helper:load`.
2. `main.js` checks the name against `SH.VENDOR_SCRIPTS` and messages the background.
3. The background injects the file into that frame's MAIN world with `chrome.scripting` (hence the `scripting` permission). Its own `VENDOR_SCRIPTS` list must match.
4. The bundle hands its exports over with `SHP.provide`.

The tools don't know Liquid, so `SHP.cm` gives them same-length copies of the template with Liquid masked: `{{ }}` becomes underscores, which reads as a name in CSS and JS, and `{% %}` becomes spaces. For JavaScript, `SHP.cm.js` puts every `<script>` into one file, since they share one global scope, so a variable from one script is suggested in the next. Suggestions drop names made only of underscores (masked Liquid) and TypeScript's "warning" entries (words seen elsewhere in the file).

`tools/build-vendor.mjs` builds all three (`npm run vendor`; each bundle's entry is `tools/<name>.entry.js`). They're committed, so the extension still has no build step. Rebuild after upgrading any of those packages. TypeScript sets up a Node file system when `process` exists, so tests evaluate `js-tools.js` with `process` hidden (`provideJsTools()` in `test/helpers/codemirror.js`); in a page there's no `process` to hide.

### Format button

By default `source-format` uses Slate's own tidying: a round trip through CKEditor's WYSIWYG view, which re-indents the HTML the way reopening the editor does. Its `prettier` option (off by default) switches to Prettier. That's meant for working in the source view: Slate re-formats the code its own way when you leave the source view or reopen the editor, so Prettier's layout doesn't last, and the popup says so in the option's note. With the option off, Shift+Alt+F does nothing in a CodeMirror outside CKEditor; with it on, it formats any CodeMirror.

With the option on, `source-format` runs Prettier (`format-tools.js`) with default settings (`CONFIG` in `src/page/features/source-format.js`: 120 columns, 2-space indent, `htmlWhitespaceSensitivity: 'css'`). `parser`, `plugins` and `cursorOffset` always come from the feature (`liquid-html`, or `css` / `babel` for an editor in a CSS or JavaScript mode). Keep `'css'` whitespace sensitivity as the default: `'ignore'` splits `</a>.` onto two lines in email copy, which renders as "link .".

The `prettierConfig` option is a JSON box in the popup (like a `.prettierrc`) whose keys go over those defaults. It's a text option that `requires: 'prettier'`, so it's greyed out while Prettier is off. Its allowed keys and their types are `PRETTIER_CONFIG` in `src/content/page-features.js`: only options that change layout, including the Liquid plugin's `embeddedSingleQuote`, `singleLineLinkTags` and `captureWhitespaceSensitivity`. The popup checks the JSON as you type (`checkJson` in `popup.js`): it must parse, be an object, and use only known keys with values of the right type. Errors show under the box and nothing is saved until they're fixed; `"htmlWhitespaceSensitivity": "ignore"` is allowed but gets a warning. It saves when you leave the box, capped at 2,000 characters to stay well inside `storage.sync`'s 8 KB per-item limit (all settings are one `features` item). If Prettier still rejects a value when formatting (its errors read `Invalid <option> value.`), Format leaves the text alone and the notice says to check the config, rather than falling back to Slate's tidying.

Prettier formats the layout around Liquid but not the Liquid itself. The Liquid plugin is built for Shopify's Liquid and would otherwise respace `{{x}}` to `{{ x }}`, swap quotes, add `{%- -%}` whitespace trimming (Slate's support for it is unknown) and rewrite Slate's `{% if {{x}} == … %}` to `{% if x == … %}`. So after formatting, every `{{ }}` and `{% %}` in the output is replaced with the original tag at the same position, after checking that the input and output have the same tags in the same order (same count, same tag names). If they don't, Prettier changed more than layout (it closes an unclosed `{% if %}` itself, for example), and the text is left as it was. Prettier tracks the cursor by syntax node, so it lands on the right line but not always on the exact character.

When Prettier fails or the Liquid check fails, a Format inside CKEditor falls back to Slate's own tidying. Either way a notice in the editor's corner says why. The Liquid parser is tolerant of broken HTML (unclosed or mismatched tags) and returns it unchanged rather than failing, so "No changes" can mean that too. The edit is one undo step.

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

### Portal editor insert

`portal-insert-block` (isolated world) reuses Slate's own palette click instead of creating blocks itself. In the portal editor each column is a jQuery UI sortable `.part_rows_container`, and the palette is `.toolbox_container > .toolbox_element[data-clickable="1"]`. Clicking a palette item appends a placeholder `<div id="part_<timestamp>">` to the *first* container and opens the block's editor dialog, which refers to the placeholder by id. The feature clicks the real palette item, moves the new placeholder into the hovered gap, and leaves the rest to Slate: when the block is saved Slate renders it in place of the placeholder and posts `save_part_order` with the page's order, so the position sticks (checked on a live portal). Cancel removes the placeholder as usual. Gaps are computed per container, so layouts with several columns work the same way. The menu is a fresh copy of the palette each time it opens, so it shows whatever block types that editor offers.

### Settings

Settings live in `chrome.storage.sync`, so they follow the browser profile:

```js
{ siteOverrides: { "host": "on" | "off" }, features: { "id": true | false, "id.option": true | false | "choice value" | "text" }, debug: false }
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
    // subgroup: 'Coding',     // optional heading inside the tab (SH.SUBGROUPS)
    description: 'What it does, shown in the popup.',
    defaultEnabled: true,
    areas: ['admin'],          // or '*'
    options: [               // checkboxes, a select when it has choices, a text box when text: true
      { id: 'part', name: 'One part of it', defaultEnabled: true },
      // note (checkboxes only): a smaller line under the name, for a caveat
      { id: 'risky', name: 'A risky part', defaultEnabled: false, note: 'What to watch out for.' },
      { id: 'size', name: 'Size', choices: [{ value: 's', label: 'Small' }, { value: 'l', label: 'Large' }], defaultValue: 's' },
      // Its value is a string ('' by default). requires: a checkbox option it only applies with.
      // json: checked in the popup as you type (see text() in src/content/page-features.js).
      { id: 'config', name: 'Config', text: true, defaultValue: '', requires: 'part', json: { keys: { width: 'number' } } },
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
- The popup shows one tab per group in `SH.GROUPS` that has features (plus *Other* for features without a known group). Keep the names short enough that the tabs fit on one row. A feature's optional `subgroup` puts it in a card under that heading inside its tab, in the order of `SH.SUBGROUPS[group]`; features without one go last, with no heading.

## Tests

```bash
npm test
```

- Tests use [Vitest](https://vitest.dev) with jsdom. Nothing runs against a real Slate instance.
- Each test loads the extension's scripts into the page the way Chrome does.
- Source-view features run against CodeMirror 5 from npm, set up like Slate's editor (htmlmixed with Liquid multiplexed in). See `test/helpers/codemirror.js`; `provideSourceTools()` and `provideJsTools()` hand the page the vendor bundles, as the background would.
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

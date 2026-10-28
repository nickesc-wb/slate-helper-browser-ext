# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Manifest V3 Chrome extension that improves Technolutions Slate's UI on any client's Slate instance (any domain). The extension has **no build step**: `manifest.json`, `icons/` and `src/` are loaded unpacked as-is. `package.json`, `node_modules/`, `test/` and `tools/` are dev tooling only and are not shipped. The one generated file is `src/vendor/source-tools.js` (see below), which is committed. The README's collapsed "Development" section is the authoritative long-form doc (detection scoring, feature templates, settings shape, release flow); keep it in sync when behavior changes.

## Commands

```bash
npm install
npm test                                        # vitest run (jsdom)
npm run test:watch
npx vitest run test/source-indent.test.js       # one file
npx vitest run -t "<test name substring>"       # tests whose name matches
npm run vendor                                  # rebuild src/vendor/source-tools.js (esbuild)
```

There is no linter or bundler. To try changes in Chrome, load the folder unpacked; in dev the extension auto-reloads itself when its files change and you reload a Slate page (`src/background.js`, `devCheck`). Debug logging: `chrome.storage.sync.set({ debug: true })` from the service worker console.

## Architecture

All source files are plain browser scripts (IIFEs, no ES modules) that communicate through globals, and **load order is defined by the `content_scripts` lists in `manifest.json`**. There are two content-script groups running in two JS worlds:

- **Isolated world** (`src/content/`, global `globalThis.SlateHelper`, "SH"): `core.js` first (namespace, `registerFeature`, `injectStyle`, debounced `onDomChange`/`onNavigate`), then `detect.js`, DOM-only features, `page-features.js`, and `main.js` last. `main.js` reads `chrome.storage.sync` settings, applies per-site overrides, runs detection, answers the popup's `slate-helper:get-state` message, and inits enabled features whose `areas` match.
- **MAIN world** (`src/page/`, global `window.SlateHelperPage`, "SHP"): needed for anything touching Slate's page objects (CKEditor, CodeMirror 5, `FW`). `runtime.js` first, `cm-utils.js`, features, `boot.js` last. `src/content/probe-main.js` also runs here (first) to report whether Slate's `FW` global exists via `<html data-slate-helper-fw>`.

**Handoff between worlds:** the isolated world owns detection and settings. When active, `main.js` writes `{ area, debug, enabled, options }` to `<html data-slate-helper-config>` and dispatches `slate-helper:activate`; `runtime.js` (`SHP.boot`) reads it and calls each enabled page feature's init. Consequently a page-world feature has two halves: its popup/settings metadata registered in `src/content/page-features.js` (with `world: 'page'`), and its code in `src/page/features/<id>.js` via `SHP.registerFeature(id, init)`. Options are keyed `'<feature>.<option>'` and read with `SHP.option(feature, option)` (page) or `ctx.option(id)` (isolated); both treat anything but explicit `false` as on.

**On-demand libraries:** VS Code's CSS/HTML language services, HTMLHint and JSHint are bundled by `tools/build-vendor.mjs` (entry `tools/source-tools.entry.js`) into `src/vendor/source-tools.js`, about 2 MB, so it's not a content script. `SHP.load(name)` fires `slate-helper:load`; `main.js` checks `SH.VENDOR_SCRIPTS` and messages the background (`slate-helper:inject`), which injects it into the frame's MAIN world via `chrome.scripting` (its own `VENDOR_SCRIPTS` list must match); the bundle calls `SHP.provide`. Source features use `SHP.cm.loadTools()` / `SHP.cm.tools`. The tools don't know Liquid, so `cm-utils.js` gives them same-length copies (`maskLiquid`, `regions`, `embed`) where offsets and lines match the editor; lint drops problems touching Liquid. `SHP.cm.onHover(cm, provider)` is the shared hover tooltip, placed above the line (lint first, then docs). `SHP.cm.docsHtml(contents, { compact, show })` splits the services' MDN markdown into parts (description, selector, support, syntax, links) and renders the compact view with a corner chevron that toggles the full one; `SHP.cm.docsSettings()` reads the Hover docs options, which the suggestion list's docs also follow. Titles inside the tooltip use `data-slate-helper-hint` (our own label), not `title`, whose native tooltip can end up behind it.

**Adding a feature** means editing `manifest.json` too: features go before `main.js` / `boot.js` in their world's list. `test/manifest.test.js` enforces that every file in `src/*/features/` is listed, ordering of core/runtime/main/boot, and that every page feature has metadata in `page-features.js`. Popup groups come from `SH.GROUPS` in `core.js`.

**DOM watching:** Slate swaps dialogs/editors in place without page loads, so features hook in via `SH.onDomChange` (must be idempotent) or `SHP.onAdded(selector, cb, when)` / `SHP.onCodeMirror` / `SHP.onCKEditor` (run once per element). Both observers debounce with `setTimeout(…, 30)`, deliberately not `requestAnimationFrame` (rAF doesn't fire in hidden tabs) — follow the same rule.

**Source-view features** work on Slate's CodeMirror 5 in a `liquid` mode (htmlmixed with `{{ }}`/`{% %}` multiplexed). `SHP.cm.context(cm, pos)` in `cm-utils.js` classifies the cursor as `liquid` / `tag` / `css` / `javascript` / `text`; indent unit is `SHP.INDENT` (2 spaces). Several features add CodeMirror keymaps for the same keys; handlers return `CodeMirror.Pass` to fall through.

`src/background.js` (service worker) handles the toolbar green-dot icon (`slate-helper:status`), dev auto-reload (`slate-helper:dev-check`), cross-origin favicon hashing for content scripts (`slate-helper:hash-image`), and the latest GitHub release lookup (`slate-helper:latest-release`, cached in `chrome.storage.local` for an hour to stay under GitHub's unauthenticated rate limit). The `update-toast` feature uses that lookup to show a bottom-right notice when the release is newer than the installed version; a dismissed version is remembered in `chrome.storage.local.dismissedRelease`. `src/popup/` shows detection status, the per-site override, and feature/option toggles.

## Tests

Vitest + jsdom; nothing runs against real Slate. `test/helpers/load.js` `loadScripts()` evaluates source files with `new Function` the way Chrome injects them, so tests `delete globalThis.SlateHelper` / `window.SlateHelperPage` before reloading and stub `globalThis.chrome` themselves (see `test/content-main.test.js`). For source-view features use `test/helpers/codemirror.js`: `setupEditor(features, value, options)` builds a Slate-like editor and boots the page runtime; `press(cm, key)` / `type(cm, text)` dispatch through keymaps; `show(cm)` returns text with the cursor marked; `provideSourceTools()` hands the page the vendor bundle (then `await sleep(0)`). In test strings **`‸` marks the cursor** (`|` is Liquid's filter pipe). `test/helpers/setup.js` clears the DOM and waits after each file so pending watcher timers don't fire after jsdom teardown.

## Source-view playground

`.claude/playground/` is Claude's fixture for trying source-view (CodeMirror) features in a real browser without Slate: `preview_start` with the `playground` config in `.claude/launch.json` serves the repo on port 5178 (`serve.mjs`) and opens `editor.html`. The page builds the same Liquid/htmlmixed editor as `test/helpers/codemirror.js`, loads the MAIN-world scripts in manifest order (so new page features show up automatically), and turns every page feature on with default options. It answers `SHP.load` itself by adding a `<script>` for the vendor bundle. URL params `?only=`, `?off=` (feature ids) and `?opt=feature.option:false` narrow that. In the page, `cm` is the editor, `playground.set(text)` sets text with `‸` as the cursor and `playground.show()` reads it back. Use real key presses (browser `key` action) to exercise keymaps; `cm.execCommand` bypasses them. There's no CKEditor or `FW`, so dialog and toolbar features (`editor-*`, `link-dialog`, find/replace and Format buttons) stay idle, and isolated-world features (detection, popup) aren't loaded.

## Branches and releases

Work on `dev`. Releasing = bump `"version"` in `manifest.json`, merge `dev` into `main`, push. `.github/workflows/release.yml` tags `v<version>` and publishes a zip of `manifest.json`, `icons/`, `src/` only if that version isn't released yet and tests pass. Installed copies only see the update notice once a release with a higher version exists, so merging to `main` without a version bump publishes nothing. `UI-CHANGES.md` and `spec-convo.md` are git-ignored local planning notes (UI-CHANGES tracks requested changes and their status).

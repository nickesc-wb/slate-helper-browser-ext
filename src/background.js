chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'slate-helper:status' && sender.tab?.id != null) {
    setActiveIcon(sender.tab.id, msg.active).catch(() => {}); // the tab may be gone
  }
  if (msg?.type === 'slate-helper:dev-check' && sender.tab?.id != null) devCheck(sender.tab.id);
  if (msg?.type === 'slate-helper:hash-image') {
    hashImage(msg.url).then(sendResponse, () => sendResponse(null));
    return true; // respond asynchronously
  }
  if (msg?.type === 'slate-helper:inject' && sender.tab?.id != null) injectVendor(sender, msg.name);
  if (msg?.type === 'slate-helper:latest-release') {
    latestRelease(msg.fresh).then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg?.type === 'slate-helper:updater') {
    updaterStatus().then(sendResponse);
    return true;
  }
  if (msg?.type === 'slate-helper:update') {
    update(sender.tab?.id).then(sendResponse);
    return true;
  }
});

// --- Toolbar icon --------------------------------------------------------------
// Tabs where Slate Helper is active get the icon with a small green dot in the
// corner. (Chrome's badge can't be made that small: even an empty badge is a
// fixed-size block.)
const ICON_SIZES = [16, 32];
let dotIcons = null; // { 16: ImageData, 32: ImageData }, built once

async function buildDotIcons() {
  const out = {};
  for (const size of ICON_SIZES) {
    const blob = await (await fetch(chrome.runtime.getURL(`icons/icon-${size}.png`))).blob();
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(await createImageBitmap(blob), 0, 0, size, size);
    const r = size * 0.19; // dot radius: 3px at 16px
    const ring = size * 0.07; // white ring so it reads on the blue tile
    const c = size - r - ring; // ring touches the corner without being clipped
    ctx.beginPath();
    ctx.arc(c, c, r + ring, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fillStyle = '#34a853';
    ctx.fill();
    out[size] = ctx.getImageData(0, 0, size, size);
  }
  return out;
}

async function setActiveIcon(tabId, active) {
  if (!active) {
    const paths = Object.fromEntries(ICON_SIZES.map((s) => [s, `icons/icon-${s}.png`]));
    return chrome.action.setIcon({ tabId, path: paths });
  }
  dotIcons ||= await buildDotIcons();
  return chrome.action.setIcon({ tabId, imageData: dotIcons });
}

// Content scripts can't read images from other origins (client favicons live
// on Slate's CDN), so they ask the background for the image's SHA-256.
async function hashImage(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) return null;
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- On-demand page scripts ------------------------------------------------------
// Big libraries the page features load only when needed (SHP.load in
// src/page/runtime.js), injected into the asking frame's MAIN world. Keep in
// sync with SH.VENDOR_SCRIPTS in src/content/core.js.
const VENDOR_SCRIPTS = ['source-tools', 'js-tools', 'format-tools'];

function injectVendor(sender, name) {
  if (!VENDOR_SCRIPTS.includes(name)) return;
  chrome.scripting.executeScript({
    target: { tabId: sender.tab.id, frameIds: [sender.frameId] },
    files: [`src/vendor/${name}.js`],
    world: 'MAIN',
  }).catch((err) => console.warn('[Slate Helper] could not load', name, err));
}

// --- Latest release ----------------------------------------------------------
// The newest GitHub release, for the update toast. Cached so page loads don't
// run into GitHub's 60 requests/hour limit for unauthenticated calls. fresh
// skips the cache (the popup's "Check for updates") and re-caches the result.
const RELEASES_API = 'https://api.github.com/repos/nickesc-wb/slate-helper-browser-ext/releases/latest';
const RELEASE_CHECK_MS = 60 * 60 * 1000;

async function latestRelease(fresh = false) {
  const { latestRelease: cached } = await chrome.storage.local.get('latestRelease');
  if (!fresh && cached && Date.now() - cached.checkedAt < RELEASE_CHECK_MS) return cached;
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return cached || null;
  const release = await res.json();
  const latest = {
    version: release.tag_name.replace(/^v/, ''),
    url: release.html_url,
    checkedAt: Date.now(),
  };
  await chrome.storage.local.set({ latestRelease: latest });
  return latest;
}

// --- Updater -------------------------------------------------------------------
// An extension can't write to its own folder, so "Update now" asks the native
// messaging host from updater/ (installed once per machine with install.cmd)
// to copy the latest release's zip over it. Git checkouts are left to git.
// After an update the extension reloads, and so does the tab that asked (see
// onInstalled below).
const UPDATER_HOST = 'com.waybetter.slate_helper';

const callUpdater = (message) =>
  chrome.runtime.sendNativeMessage(UPDATER_HOST, message).catch((err) => ({ ok: false, error: err.message }));

/**
 * { available, error }: available when the updater answers and this copy
 * isn't a git checkout; error is Chrome's reason when it didn't answer.
 */
async function updaterStatus() {
  const reply = await callUpdater({ type: 'ping' });
  return { available: !!reply.ok && !reply.git, error: reply.error };
}

async function update(tabId) {
  const reply = await callUpdater({ type: 'update' });
  if (!reply.ok) return reply;
  if (tabId != null) await chrome.storage.local.set({ devReloadTab: tabId });
  setTimeout(() => chrome.runtime.reload(), 100); // let the reply reach the caller first
  return reply;
}

// --- Dev auto-reload (unpacked installs only) ---------------------------------
// Chrome only picks up content-script edits when the extension is reloaded. In
// development, each Slate page load compares the extension's files against
// what was loaded; if anything changed, the extension reloads itself and then
// reloads the tab that noticed. Other open tabs are left alone (they may have
// unsaved work); the popup offers to reload them.
const IS_DEV = !('update_url' in chrome.runtime.getManifest());

async function filesHash() {
  const m = chrome.runtime.getManifest();
  const files = new Set(['manifest.json', m.background.service_worker, ...VENDOR_SCRIPTS.map((n) => `src/vendor/${n}.js`)]);
  for (const cs of m.content_scripts) (cs.js || []).concat(cs.css || []).forEach((f) => files.add(f));
  let text = '';
  for (const f of files) text += f + (await (await fetch(chrome.runtime.getURL(f))).text());
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function devCheck(tabId) {
  if (!IS_DEV) return;
  const { devHash } = await chrome.storage.session.get('devHash');
  const now = await filesHash();
  if (!devHash) return chrome.storage.session.set({ devHash: now });
  if (now === devHash) return;
  // Session storage is cleared by the reload, so hand the tab over in local.
  await chrome.storage.local.set({ devReloadTab: tabId });
  chrome.runtime.reload();
}

chrome.runtime.onInstalled.addListener(async () => {
  if (!IS_DEV) return;
  await chrome.storage.session.set({ devHash: await filesHash() });
  const { devReloadTab } = await chrome.storage.local.get('devReloadTab');
  await chrome.storage.local.remove(['devReloadTab', 'devReloadTabs']);
  if (devReloadTab != null) chrome.tabs.reload(devReloadTab).catch(() => {});
});

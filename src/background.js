chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'slate-helper:status' && sender.tab?.id != null) {
    setActiveIcon(sender.tab.id, msg.active).catch(() => {}); // the tab may be gone
  }
  if (msg?.type === 'slate-helper:dev-check' && sender.tab?.id != null) devCheck(sender.tab.id);
  if (msg?.type === 'slate-helper:hash-image') {
    hashImage(msg.url).then(sendResponse, () => sendResponse(null));
    return true; // respond asynchronously
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

// --- Dev auto-reload (unpacked installs only) ---------------------------------
// Chrome only picks up content-script edits when the extension is reloaded. In
// development, each Slate page load compares the extension's files against
// what was loaded; if anything changed, the extension reloads itself and then
// reloads the tab that noticed. Other open tabs are left alone (they may have
// unsaved work); the popup offers to reload them.
const IS_DEV = !('update_url' in chrome.runtime.getManifest());

async function filesHash() {
  const m = chrome.runtime.getManifest();
  const files = new Set(['manifest.json', m.background.service_worker]);
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

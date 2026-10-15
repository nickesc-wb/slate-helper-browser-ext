// Shows an "ON" badge on the toolbar icon for tabs where Slate Helper is active.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'slate-helper:status' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    chrome.action.setBadgeText({ tabId, text: msg.active ? 'ON' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2e7d32' });
    if (IS_DEV) trackSlateTab(tabId, msg.active);
  }
  if (msg?.type === 'slate-helper:dev-check' && sender.tab?.id != null) devCheck();
});

// --- Dev auto-reload (unpacked installs only) ---------------------------------
// Chrome only picks up content-script edits when the extension is reloaded. In
// development, each Slate page load compares the extension's files against
// what was loaded; if anything changed, the extension reloads itself and then
// reloads every open Slate tab (a reload disconnects the old content scripts
// in all of them, not just the tab that noticed).
const IS_DEV = !('update_url' in chrome.runtime.getManifest());

async function trackSlateTab(tabId, active) {
  const { slateTabs = {} } = await chrome.storage.session.get('slateTabs');
  if (active) slateTabs[tabId] = true;
  else delete slateTabs[tabId];
  await chrome.storage.session.set({ slateTabs });
}

async function filesHash() {
  const m = chrome.runtime.getManifest();
  const files = new Set(['manifest.json', m.background.service_worker]);
  for (const cs of m.content_scripts) (cs.js || []).concat(cs.css || []).forEach((f) => files.add(f));
  let text = '';
  for (const f of files) text += f + (await (await fetch(chrome.runtime.getURL(f))).text());
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function devCheck() {
  if (!IS_DEV) return;
  const { devHash, slateTabs = {} } = await chrome.storage.session.get(['devHash', 'slateTabs']);
  const now = await filesHash();
  if (!devHash) return chrome.storage.session.set({ devHash: now });
  if (now === devHash) return;
  // Session storage is cleared by the reload, so hand the tab list over in local.
  await chrome.storage.local.set({ devReloadTabs: Object.keys(slateTabs).map(Number) });
  chrome.runtime.reload();
}

chrome.runtime.onInstalled.addListener(async () => {
  if (!IS_DEV) return;
  await chrome.storage.session.set({ devHash: await filesHash() });
  const { devReloadTabs = [] } = await chrome.storage.local.get('devReloadTabs');
  await chrome.storage.local.remove('devReloadTabs');
  for (const tabId of devReloadTabs) chrome.tabs.reload(tabId).catch(() => {});
});

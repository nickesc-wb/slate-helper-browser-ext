// Shows an "ON" badge on the toolbar icon for tabs where Slate Helper is active.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== 'slate-helper:status' || sender.tab?.id == null) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: msg.active ? 'ON' : '' });
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#2e7d32' });
});

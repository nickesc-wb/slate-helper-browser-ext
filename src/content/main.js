// Entry point: detect Slate, then start the enabled features. Must be the last
// content script in the manifest so every feature has registered by now.
(async () => {
  const SH = globalThis.SlateHelper;
  SH.state = null;

  // The popup asks the page for its state (detection result, feature list).
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== 'slate-helper:get-state') return;
    sendResponse(SH.state ? { ready: true, ...SH.state } : { ready: false });
  });

  const settings = await SH.getSettings();
  SH.debug = settings.debug;

  const host = location.hostname;
  const override = settings.siteOverrides[host] || 'auto';
  const detection = await SH.detectSlate();
  const active = override === 'on' || (override === 'auto' && detection.isSlate);

  const features = SH.features.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description,
    enabled: settings.features[f.id] ?? f.defaultEnabled,
    appliesHere: f.areas === '*' || f.areas.includes(detection.area),
    running: false,
  }));

  SH.state = { host, override, active, detection, features };
  SH.log('detection', detection, 'override', override, 'active', active);
  chrome.runtime.sendMessage({ type: 'slate-helper:status', active }).catch(() => {});

  if (!active) return;

  document.documentElement.classList.add('slate-helper-active', `slate-helper-area-${detection.area}`);

  const ctx = { host, area: detection.area, settings };
  SH.features.forEach((feature, i) => {
    const info = features[i];
    if (!info.enabled || !info.appliesHere) return;
    try {
      feature.init(ctx);
      info.running = true;
      SH.log('started', feature.id);
    } catch (err) {
      console.error(`[Slate Helper] feature "${feature.id}" failed`, err);
    }
  });
})();

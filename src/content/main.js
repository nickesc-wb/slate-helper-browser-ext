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
    group: f.group || 'Other',
    name: f.name,
    description: f.description,
    enabled: settings.features[f.id] ?? f.defaultEnabled,
    options: (f.options || []).map((o) => ({
      id: o.id,
      name: o.name,
      enabled: settings.features[SH.optionKey(f.id, o.id)] ?? o.defaultEnabled,
    })),
    appliesHere: f.areas === '*' || f.areas.includes(detection.area),
    running: false,
  }));

  // { 'feature.option': true|false } for every option, for the page world.
  const optionValues = {};
  features.forEach((f) => f.options.forEach((o) => { optionValues[SH.optionKey(f.id, o.id)] = o.enabled; }));

  SH.state = { host, override, active, detection, features, groups: SH.GROUPS };
  SH.log('detection', detection, 'override', override, 'active', active);
  chrome.runtime.sendMessage({ type: 'slate-helper:status', active }).catch(() => {});

  if (!active) return;

  chrome.runtime.sendMessage({ type: 'slate-helper:dev-check' }).catch(() => {});
  document.documentElement.classList.add('slate-helper-active', `slate-helper-area-${detection.area}`);

  // Hand the enabled page-world features over to src/page/runtime.js.
  const pageEnabled = SH.features
    .filter((f, i) => f.world === 'page' && features[i].enabled && features[i].appliesHere)
    .map((f) => f.id);
  document.documentElement.setAttribute('data-slate-helper-config', JSON.stringify({
    area: detection.area,
    debug: settings.debug,
    enabled: pageEnabled,
    options: optionValues,
  }));
  document.dispatchEvent(new CustomEvent('slate-helper:activate'));
  features.forEach((info) => { if (pageEnabled.includes(info.id)) info.running = true; });

  SH.features.forEach((feature, i) => {
    const info = features[i];
    if (feature.world === 'page' || !info.enabled || !info.appliesHere) return;
    const ctx = {
      host,
      area: detection.area,
      settings,
      option: (optionId) => optionValues[SH.optionKey(feature.id, optionId)] !== false,
    };
    const fail = (err) => console.error(`[Slate Helper] feature "${feature.id}" failed`, err);
    try {
      Promise.resolve(feature.init(ctx)).catch(fail); // init may be async
      info.running = true;
      SH.log('started', feature.id);
    } catch (err) {
      fail(err);
    }
  });
})();

// Shared namespace for all Slate Helper content scripts. Content scripts share
// one isolated world per page, so files listed in the manifest communicate
// through this global.
(() => {
  const SH = (globalThis.SlateHelper = globalThis.SlateHelper || {});

  SH.DEFAULT_SETTINGS = {
    siteOverrides: {}, // { "apply.school.edu": "on" | "off" }
    features: {},      // { "instance-badge": true | false }
    debug: false,
  };

  SH.features = [];
  SH.debug = false;

  /**
   * Register a feature. Shape:
   *   id:             stable key used in settings
   *   name, description: shown in the popup
   *   defaultEnabled: boolean
   *   areas:          '*' or any of ['admin', 'portal', 'apply', 'other']
   *   init(ctx):      called once when the page is a Slate page
   *   group:          popup section heading
   *   options:        optional sub-toggles: [{ id, name, defaultEnabled }];
   *                   read with ctx.option(id)
   *   world:          'page' for features whose code runs in the MAIN world
   *                   (src/page/features/); those have no init here
   */
  SH.registerFeature = (feature) => SH.features.push(feature);

  SH.getSettings = () => chrome.storage.sync.get(SH.DEFAULT_SETTINGS);

  // Popup section order. Features without a group go last.
  SH.GROUPS = ['Client instance', 'Dialogs', 'Source view', 'Query builder'];

  /** Settings key for a feature option: settings.features['<feature>.<option>']. */
  SH.optionKey = (featureId, optionId) => `${featureId}.${optionId}`;

  SH.log = (...args) => {
    if (SH.debug) console.log('[Slate Helper]', ...args);
  };

  SH.injectStyle = (id, css) => {
    const elId = `slate-helper-style-${id}`;
    let el = document.getElementById(elId);
    if (!el) {
      el = document.createElement('style');
      el.id = elId;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = css;
    return el;
  };

  // Slate swaps content in place (dialogs, tabs, query results) without full
  // page loads. Features that touch the DOM should hook in here rather than
  // only running once at init.
  const domCallbacks = [];
  const navCallbacks = [];
  let lastHref = location.href;
  let observer = null;
  let pending = false;

  const flush = () => {
    pending = false;
    if (location.href !== lastHref) {
      lastHref = location.href;
      navCallbacks.forEach((cb) => safeCall(cb, location.href));
    }
    domCallbacks.forEach((cb) => safeCall(cb));
  };

  const ensureObserver = () => {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(flush, 30); // not rAF: it does not run in hidden tabs
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', flush);
    window.addEventListener('hashchange', flush);
  };

  const safeCall = (cb, ...args) => {
    try {
      cb(...args);
    } catch (err) {
      console.error('[Slate Helper]', err);
    }
  };

  /** Run cb (debounced) whenever the DOM changes. */
  SH.onDomChange = (cb) => {
    ensureObserver();
    domCallbacks.push(cb);
  };

  /** Run cb when the URL changes without a full page load. */
  SH.onNavigate = (cb) => {
    ensureObserver();
    navCallbacks.push(cb);
  };
})();

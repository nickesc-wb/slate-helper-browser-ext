// Runtime for features that run in the page's MAIN world. These need direct
// access to page objects (CKEditor, CodeMirror) that the isolated
// content-script world can't see. The isolated world decides whether the page
// is Slate and which features are on, then hands that over through the
// data-slate-helper-config attribute + the slate-helper:activate event.
(() => {
  const SHP = (window.SlateHelperPage = window.SlateHelperPage || {});
  SHP.features = {};
  SHP.debug = false;

  /** Register a page feature. init(config) runs once if the feature is enabled. */
  SHP.registerFeature = (id, init) => { SHP.features[id] = init; };

  /** Whether a feature option (sub-toggle in the popup) is on. */
  SHP.option = (featureId, optionId) => SHP.options?.[`${featureId}.${optionId}`] !== false;

  /** The value picked for a feature's choice option (a select in the popup). */
  SHP.optionValue = (featureId, optionId) => SHP.options?.[`${featureId}.${optionId}`];

  SHP.log = (...args) => {
    if (SHP.debug) console.log('[Slate Helper]', ...args);
  };

  SHP.injectStyle = (id, css) => {
    const elId = `slate-helper-style-${id}`;
    let el = document.getElementById(elId);
    if (!el) {
      el = document.createElement('style');
      el.id = elId;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = css;
  };

  // --- Watching for new elements ------------------------------------------------
  // Slate builds dialogs, editors etc. on the fly, so features hook in as the
  // elements appear.
  const watchers = [];
  let observer = null;

  const scan = () => {
    for (const w of watchers) {
      document.querySelectorAll(w.selector).forEach((el) => {
        if (w.seen.has(el) || !w.when(el)) return;
        w.seen.add(el);
        try {
          w.cb(el);
        } catch (err) {
          console.error('[Slate Helper]', err);
        }
      });
    }
  };

  /**
   * Run cb(el) once for every element matching selector, now and as new ones
   * appear. An element isn't counted until when(el) is true.
   */
  SHP.onAdded = (selector, cb, when = () => true) => {
    watchers.push({ selector, cb, when, seen: new WeakSet() });
    if (!observer) {
      let pending = false;
      observer = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        // A timer, not requestAnimationFrame: rAF doesn't run in hidden tabs.
        setTimeout(() => { pending = false; scan(); }, 30);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    scan();
  };

  // --- Scripts loaded on demand ------------------------------------------------
  // Big libraries (src/vendor/) aren't content scripts, so they don't load into
  // every page. SHP.load(name) asks the isolated world (main.js) to have
  // src/vendor/<name>.js injected into this page; that script then calls
  // SHP.provide(name, value), which resolves the promise.
  const loads = {};
  const pending = (name) => {
    if (!loads[name]) {
      let resolve;
      loads[name] = { promise: new Promise((r) => { resolve = r; }), resolve, requested: false };
    }
    return loads[name];
  };

  SHP.provide = (name, value) => pending(name).resolve(value);

  SHP.load = (name) => {
    const entry = pending(name);
    if (!entry.requested) {
      entry.requested = true;
      document.dispatchEvent(new CustomEvent('slate-helper:load', { detail: name }));
    }
    return entry.promise;
  };

  /** Run cb(cm) for every CodeMirror editor (Slate creates one each time source view opens). */
  SHP.onCodeMirror = (cb) => SHP.onAdded('.CodeMirror', (el) => cb(el.CodeMirror), (el) => !!el.CodeMirror);

  // --- Activation -------------------------------------------------------------
  let started = false;
  SHP.boot = () => {
    const start = () => {
      const raw = document.documentElement.getAttribute('data-slate-helper-config');
      if (!raw || started) return;
      started = true;
      const config = JSON.parse(raw);
      SHP.debug = config.debug;
      SHP.options = config.options || {};
      for (const id of config.enabled) {
        const init = SHP.features[id];
        if (!init) continue;
        try {
          init(config);
          SHP.log('started', id);
        } catch (err) {
          console.error(`[Slate Helper] feature "${id}" failed`, err);
        }
      }
    };
    document.addEventListener('slate-helper:activate', start);
    start();
  };
})();

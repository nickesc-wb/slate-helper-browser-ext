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

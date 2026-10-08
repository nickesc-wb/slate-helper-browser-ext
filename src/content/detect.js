// Decides whether the current page is a Slate page. Every client has its own
// domain (apply.school.edu, gradadmissions.school.edu, *.technolutions.net,
// ...), so we score page fingerprints instead of matching hostnames.
(() => {
  const SH = globalThis.SlateHelper;

  const THRESHOLD = 5;
  const PROBE_TIMEOUT_MS = 1000;

  // The MAIN-world probe and this script both run at document_idle, in no
  // guaranteed order, so wait briefly for the probe's result.
  const readFwProbe = () =>
    new Promise((resolve) => {
      const read = () => document.documentElement.getAttribute('data-slate-helper-fw');
      if (read() !== null) return resolve(read() === '1');
      const done = () => {
        clearTimeout(timer);
        document.removeEventListener('slate-helper:probe', done);
        resolve(read() === '1');
      };
      const timer = setTimeout(done, PROBE_TIMEOUT_MS);
      document.addEventListener('slate-helper:probe', done);
    });

  const getArea = (path) => {
    if (/^\/manage(\/|$)/.test(path)) return 'admin';
    if (/^\/apply(\/|$)/.test(path)) return 'apply';
    if (/^\/(portal|register|account)(\/|$)/.test(path)) return 'portal';
    return 'other';
  };

  SH.detectSlate = async () => {
    const host = location.hostname;
    const path = location.pathname.toLowerCase();
    const signals = [];
    const add = (id, weight) => signals.push({ id, weight });

    if (/(^|\.)technolutions\.net$/.test(host)) add('technolutions-host', 10);
    if (/^\/(manage|apply|portal|register|account)(\/|$)/.test(path)) add('slate-path', 2);
    if (document.querySelector('script[src*="/shared/"], link[href*="/shared/"]')) add('shared-assets', 2);
    if (document.querySelector('a[href*="technolutions.com"], a[href*="technolutions.net"]')) add('technolutions-link', 3);
    if (await readFwProbe()) add('fw-global', 5);

    const score = signals.reduce((sum, s) => sum + s.weight, 0);
    return {
      isSlate: score >= THRESHOLD,
      score,
      threshold: THRESHOLD,
      area: getArea(path),
      signals,
    };
  };
})();

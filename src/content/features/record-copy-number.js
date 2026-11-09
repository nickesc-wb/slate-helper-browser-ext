// Record pages: click the record number in the top-right of the header to copy
// it. Hovering shows a "Click to copy" hint below it, which turns into "Copied
// to clipboard" once clicked. Below, because above it Slate's sticky top bar can
// cover the hint.
//
// Slate writes the number as a bare text node in the header's .subheading,
// right after the status (#person_status), so we wrap it in a span of our own.
(() => {
  const SH = globalThis.SlateHelper;

  const HINT = 'Click to copy';
  const DONE = 'Copied to clipboard';

  // The record number's text node, or null when there's none (not a record
  // page) or it's already wrapped.
  const numberNode = () => {
    const sub = document.getElementById('person_status')?.closest('.subheading');
    if (!sub || sub.querySelector('.slate-helper-copy')) return null;
    return [...sub.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && /^\s*\S+\s*$/.test(n.textContent)) || null;
  };

  // navigator.clipboard needs a focused page; execCommand is the fallback.
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position: fixed; opacity: 0;';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }
  };

  const wrap = (node) => {
    const [, before, number, after] = node.textContent.match(/^(\s*)(\S+)(\s*)$/);
    const el = document.createElement('span');
    el.className = 'slate-helper-copy';
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Copy record number ${number}`);
    // The hint is drawn from data-hint by CSS, so the header's text stays
    // just the number.
    el.dataset.hint = HINT;
    el.textContent = number;
    node.replaceWith(before, el, after);

    const run = async () => {
      if (!(await copy(number))) return;
      el.dataset.hint = DONE;
      el.setAttribute('aria-label', `${DONE}: ${number}`);
      el.classList.add('slate-helper-copy-done');
      SH.log('record-copy-number: copied', number);
    };
    el.addEventListener('click', run);
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      run();
    });
    // Back to the hint once it has faded out.
    const reset = () => {
      el.classList.remove('slate-helper-copy-done');
      setTimeout(() => {
        if (el.classList.contains('slate-helper-copy-done')) return;
        el.dataset.hint = HINT;
        el.setAttribute('aria-label', `Copy record number ${number}`);
      }, 200);
    };
    el.addEventListener('mouseleave', reset);
    el.addEventListener('blur', reset);
  };

  SH.registerFeature({
    id: 'record-copy-number',
    group: 'Utilities',
    name: 'Click to copy record number',
    description: 'On a record, click the record number at the top right to copy it.',
    defaultEnabled: true,
    areas: ['admin'],
    init() {
      SH.injectStyle('record-copy-number', `
        .slate-helper-copy { position: relative; cursor: pointer; border-radius: 3px; transition: background-color 0.15s; }
        .slate-helper-copy:hover, .slate-helper-copy:focus-visible { background: #eef3fa; outline: none; }
        /* ::before is the hint bubble, ::after its arrow. */
        .slate-helper-copy::before, .slate-helper-copy::after { position: absolute; left: 50%; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 0.15s, visibility 0s 0.15s; }
        .slate-helper-copy::before { content: attr(data-hint); top: calc(100% + 6px); transform: translateX(-50%); padding: 3px 7px; border-radius: 3px; background: #333; color: #fff; font: 11px/1.3 Tahoma, Arial, Helvetica, sans-serif; white-space: nowrap; }
        .slate-helper-copy::after { content: ''; top: calc(100% - 2px); margin-left: -4px; border: 4px solid transparent; border-bottom-color: #333; }
        .slate-helper-copy:is(:hover, :focus-visible, .slate-helper-copy-done)::before,
        .slate-helper-copy:is(:hover, :focus-visible, .slate-helper-copy-done)::after { opacity: 1; visibility: visible; transition: opacity 0.15s; }
      `);
      const scan = () => {
        const node = numberNode();
        if (node) wrap(node);
      };
      scan();
      SH.onDomChange(scan);
    },
  });
})();

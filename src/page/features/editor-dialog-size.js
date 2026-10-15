// Slate dialogs open at a fixed size (the content editor's is 875 x 564) and
// are centered with a formula that assumes that size, so in a narrow window
// they're cut off at the sides. This keeps every dialog inside the window, and
// makes dialogs with a WYSIWYG editor open taller, giving the extra height to
// the editor.
(() => {
  const SHP = window.SlateHelperPage;

  const HEIGHT_SHARE = 0.85; // editor dialogs open at this share of the window height
  const MARGIN = 8;

  const center = (host) => {
    const r = host.getBoundingClientRect();
    host.style.left = `${Math.max(MARGIN, (innerWidth - r.width) / 2)}px`;
    host.style.top = `${Math.max(MARGIN, (innerHeight - r.height) / 2)}px`;
  };

  // Narrow the dialog if the window is too small, and move it back on screen.
  const fit = (host) => {
    const form = host.querySelector('form'); // Slate puts the fixed width on the form
    if (form) form.style.maxWidth = `${innerWidth - 2 * MARGIN}px`;
    const r = host.getBoundingClientRect();
    if (r.left < MARGIN || r.right > innerWidth - MARGIN || r.top < MARGIN || r.bottom > innerHeight - MARGIN) {
      center(host);
    }
  };

  const grow = (host, editor) => {
    const content = host.querySelector('.content');
    if (!content) return;
    const target = Math.min(Math.round(innerHeight * HEIGHT_SHARE), innerHeight - 2 * MARGIN);
    const extra = Math.round(target - host.getBoundingClientRect().height);
    if (extra <= 0) return;
    const contentHeight = parseFloat(content.style.height) || parseFloat(getComputedStyle(content).height);
    content.style.height = `${contentHeight + extra}px`;
    const editorHeight = editor.ui.space('contents').$.offsetHeight;
    editor.resize('100%', editorHeight + extra, true);
    center(host);
  };

  SHP.registerFeature('editor-dialog-size', () => {
    const hosts = new Set();

    SHP.onAdded('.dialog_host', (host) => {
      hosts.add(host);
      fit(host);
    });

    // CKEditor is built after the dialog appears, so watch for it separately.
    SHP.onCKEditor((editor) => {
      const host = editor.container.$.closest('.dialog_host');
      if (host) grow(host, editor);
    });

    window.addEventListener('resize', () => {
      for (const host of hosts) {
        if (!host.isConnected) hosts.delete(host);
        else fit(host);
      }
    });
  });
})();

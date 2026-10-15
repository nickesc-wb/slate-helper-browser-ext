// Slate dialog sizing. Each part is an option in the popup:
//  - fit:    Slate dialogs open at a fixed size (the content editor's is
//            875 x 564) and are centered with a formula that assumes it, so in
//            a narrow window they're cut off. Keep every dialog inside the
//            window, narrowing it if needed.
//  - taller: dialogs with a WYSIWYG editor open taller, giving the extra
//            height to the editor.
//  - resize: drag any edge or corner of a dialog to resize it.
(() => {
  const SHP = window.SlateHelperPage;

  const HEIGHT_SHARE = 0.85; // editor dialogs open at this share of the window height
  const MARGIN = 8;
  const MIN_WIDTH = 360;
  const MIN_CONTENT_HEIGHT = 120;
  const DIRECTIONS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

  const on = (option) => SHP.option('editor-dialog-size', option);

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

  const editorIn = (host) => {
    const ckeEl = host.querySelector('.cke');
    return ckeEl && SHP.ckeditorFor(ckeEl);
  };

  const contentHeight = (content) =>
    parseFloat(content.style.height) || parseFloat(getComputedStyle(content).height);

  // Change the dialog's height by `delta`, giving it to the editor if there is one.
  const addHeight = (host, delta, from = null) => {
    const content = host.querySelector('.content');
    if (!content) return;
    const start = from || { content: contentHeight(content), editor: editorIn(host)?.ui.space('contents').$.offsetHeight };
    content.style.height = `${start.content + delta}px`;
    const editor = editorIn(host);
    if (editor && start.editor != null) editor.resize('100%', start.editor + delta, true);
  };

  const grow = (host) => {
    const target = Math.min(Math.round(innerHeight * HEIGHT_SHARE), innerHeight - 2 * MARGIN);
    const extra = Math.round(target - host.getBoundingClientRect().height);
    if (extra <= 0) return;
    addHeight(host, extra);
    center(host);
  };

  // --- Drag to resize -------------------------------------------------------------

  const startResize = (host, dir, e) => {
    const form = host.querySelector('form');
    const content = host.querySelector('.content');
    if (!form || !content) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);

    const rect = host.getBoundingClientRect();
    const start = {
      x: e.clientX,
      y: e.clientY,
      left: rect.left,
      top: rect.top,
      width: form.getBoundingClientRect().width,
      content: contentHeight(content),
      editor: editorIn(host)?.ui.space('contents').$.offsetHeight,
      chrome: rect.height - contentHeight(content), // header, buttons, padding
    };
    form.style.maxWidth = 'none';
    document.documentElement.classList.add('slate-helper-resizing');

    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;

      if (dir.includes('e') || dir.includes('w')) {
        const maxWidth = innerWidth - 2 * MARGIN;
        let width = start.width + (dir.includes('e') ? dx : -dx);
        width = Math.max(MIN_WIDTH, Math.min(maxWidth, width));
        form.style.width = `${width}px`;
        if (dir.includes('w')) host.style.left = `${start.left + (start.width - width)}px`;
      }

      if (dir.includes('n') || dir.includes('s')) {
        const maxContent = innerHeight - 2 * MARGIN - start.chrome;
        let height = start.content + (dir.includes('s') ? dy : -dy);
        height = Math.max(MIN_CONTENT_HEIGHT, Math.min(maxContent, height));
        const delta = height - start.content;
        addHeight(host, delta, start);
        if (dir.includes('n')) host.style.top = `${start.top - delta}px`;
      }
    };

    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      document.documentElement.classList.remove('slate-helper-resizing');
      if (on('fit')) fit(host);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  const addHandles = (host) => {
    for (const dir of DIRECTIONS) {
      const handle = document.createElement('div');
      handle.className = `slate-helper-rz slate-helper-rz-${dir}`;
      handle.addEventListener('pointerdown', (e) => startResize(host, dir, e));
      host.appendChild(handle);
    }
  };

  const RESIZE_CSS = `
    .slate-helper-rz { position: absolute; z-index: 10; }
    .slate-helper-rz-n, .slate-helper-rz-s { left: 8px; right: 8px; height: 6px; cursor: ns-resize; }
    .slate-helper-rz-e, .slate-helper-rz-w { top: 8px; bottom: 8px; width: 6px; cursor: ew-resize; }
    .slate-helper-rz-n { top: -3px; }
    .slate-helper-rz-s { bottom: -3px; }
    .slate-helper-rz-e { right: -3px; }
    .slate-helper-rz-w { left: -3px; }
    .slate-helper-rz-ne, .slate-helper-rz-nw, .slate-helper-rz-se, .slate-helper-rz-sw { width: 12px; height: 12px; }
    .slate-helper-rz-ne { top: -4px; right: -4px; cursor: nesw-resize; }
    .slate-helper-rz-sw { bottom: -4px; left: -4px; cursor: nesw-resize; }
    .slate-helper-rz-nw { top: -4px; left: -4px; cursor: nwse-resize; }
    .slate-helper-rz-se { bottom: -4px; right: -4px; cursor: nwse-resize; }
    html.slate-helper-resizing, html.slate-helper-resizing * { user-select: none !important; }
  `;

  SHP.registerFeature('editor-dialog-size', () => {
    const hosts = new Set();
    if (on('resize')) SHP.injectStyle('dialog-resize', RESIZE_CSS);

    SHP.onAdded('.dialog_host', (host) => {
      hosts.add(host);
      if (on('fit')) fit(host);
      if (on('resize')) addHandles(host);
    });

    // CKEditor is built after the dialog appears, so watch for it separately.
    if (on('taller')) {
      SHP.onCKEditor((editor) => {
        const host = editor.container.$.closest('.dialog_host');
        if (host) grow(host);
      });
    }

    if (on('fit')) {
      window.addEventListener('resize', () => {
        for (const host of hosts) {
          if (!host.isConnected) hosts.delete(host);
          else fit(host);
        }
      });
    }
  });
})();

// Small corner badge showing which client instance you're on, so it's obvious
// at a glance when you have several clients' Slate tabs open.
(() => {
  const SH = globalThis.SlateHelper;

  SH.registerFeature({
    id: 'instance-badge',
    group: 'Client instance',
    name: 'Instance badge',
    description: 'Corner badge with the client hostname and Slate area. Click to hide.',
    defaultEnabled: true,
    areas: '*',
    init(ctx) {
      SH.injectStyle('instance-badge', `
        #slate-helper-instance-badge {
          position: fixed;
          left: 8px;
          bottom: 8px;
          z-index: 900; /* below Slate dialogs (1000), so a maximized dialog covers it */
          padding: 3px 8px;
          border-radius: 10px;
          background: rgba(33, 33, 33, 0.85);
          color: #fff;
          font: 600 11px/1.4 system-ui, sans-serif;
          cursor: pointer;
          user-select: none;
        }
      `);

      const badge = document.createElement('div');
      badge.id = 'slate-helper-instance-badge';
      badge.title = 'Slate Helper: click to hide';
      badge.textContent = `${ctx.host} · ${ctx.area}`;
      badge.addEventListener('click', () => badge.remove());
      document.body.appendChild(badge);
    },
  });
})();

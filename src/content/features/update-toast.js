// Toast in the bottom-right corner when GitHub has a newer release than the
// installed version, linking to the release. Closing it hides it until the
// next release.
(() => {
  const SH = globalThis.SlateHelper;

  /** True if version a is newer than b ("0.10.0" > "0.9.1"). */
  SH.isNewerVersion = (a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0;
    }
    return false;
  };

  const show = (release) => {
    SH.injectStyle('update-toast', `
      #slate-helper-update-toast {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 900; /* below Slate dialogs (1000), like the instance badge */
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px 8px 12px;
        border-radius: 6px;
        background: rgba(33, 33, 33, 0.92);
        color: #fff;
        font: 13px/1.4 system-ui, sans-serif;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      }
      #slate-helper-update-toast a { color: #8ab4f8; font-weight: 600; }
      #slate-helper-update-toast button {
        border: 0;
        padding: 0 2px;
        background: none;
        color: #bbb;
        font: 16px/1 system-ui, sans-serif;
        cursor: pointer;
      }
      #slate-helper-update-toast button:hover { color: #fff; }
    `);

    const toast = document.createElement('div');
    toast.id = 'slate-helper-update-toast';
    const text = document.createElement('span');
    text.textContent = `Slate Helper ${release.version} is available. `;
    const link = document.createElement('a');
    link.href = release.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Get the update';
    text.appendChild(link);
    const close = document.createElement('button');
    close.type = 'button';
    close.title = 'Hide until the next release';
    close.textContent = '×';
    close.addEventListener('click', () => {
      toast.remove();
      chrome.storage.local.set({ dismissedRelease: release.version });
    });
    toast.append(text, close);
    document.body.appendChild(toast);
  };

  SH.registerFeature({
    id: 'update-toast',
    group: 'Extension',
    name: 'Update notice',
    description: 'Shows a notice in the bottom-right corner when a new Slate Helper release is on GitHub.',
    defaultEnabled: true,
    areas: '*',
    async init() {
      const release = await chrome.runtime.sendMessage({ type: 'slate-helper:latest-release' });
      if (!release || !SH.isNewerVersion(release.version, chrome.runtime.getManifest().version)) return;
      const { dismissedRelease } = await chrome.storage.local.get('dismissedRelease');
      if (dismissedRelease === release.version) return;
      show(release);
    },
  });
})();

// Shows the instance's favicon in the backend header, to the left of the Slate
// logo, so client instances are easy to tell apart. Instances still using
// Slate's default favicon show nothing.
(() => {
  const SH = globalThis.SlateHelper;

  const ICON_SIZE = 24;
  const GAP = 8;
  // SHA-256 of Slate's default /favicon.ico (the blue "slate" square).
  const DEFAULT_FAVICONS = new Set([
    'a22a9f9839867a2bcaa969f0a560cd9d84f73d4e178095d4ae0933ab1593e135',
  ]);

  const sha256 = async (buf) => {
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const faviconUrl = () => {
    const links = [...document.querySelectorAll('link[rel~="icon"]')];
    return links.length ? links[links.length - 1].href : `${location.origin}/favicon.ico`;
  };

  SH.registerFeature({
    id: 'instance-favicon',
    name: 'Client favicon in header',
    description: "Shows the instance's favicon to the left of the Slate logo. Nothing shows if the instance uses Slate's default icon.",
    defaultEnabled: true,
    areas: ['admin'],
    async init() {
      const logoItem = document.getElementById('menu__manage_');
      if (!logoItem) return;

      const res = await fetch(faviconUrl()).catch(() => null);
      if (!res?.ok) return;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/') || DEFAULT_FAVICONS.has(await sha256(await blob.arrayBuffer()))) return;

      SH.injectStyle('instance-favicon', `
        #slate-helper-favicon {
          position: absolute;
          left: 0;
          width: ${ICON_SIZE}px;
          height: ${ICON_SIZE}px;
          padding: 2px;
          box-sizing: border-box;
          border-radius: 4px;
          background: #fff;
          object-fit: contain;
        }
      `);

      // The logo is absolutely positioned at the header's left edge; shift it
      // and the menu icons right to make room.
      const icon = document.createElement('img');
      icon.id = 'slate-helper-favicon';
      icon.alt = '';
      icon.src = URL.createObjectURL(blob);
      icon.style.top = `${Math.round((logoItem.offsetHeight - ICON_SIZE) / 2) + logoItem.offsetTop}px`;
      logoItem.parentElement.insertBefore(icon, logoItem);

      const shift = ICON_SIZE + GAP;
      logoItem.style.left = `${logoItem.offsetLeft + shift}px`;
      const menu = logoItem.closest('ul');
      menu.style.paddingLeft = `${parseFloat(getComputedStyle(menu).paddingLeft) + shift}px`;
    },
  });
})();

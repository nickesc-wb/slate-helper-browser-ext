// Shows the instance's favicon in the backend header, to the left of the Slate
// logo, so client instances are easy to tell apart. Instances still using
// Slate's default favicon show nothing.
//
// Slate has two headers: the desktop one (logo in #menu__manage_) and a
// compact one for narrow windows (logo is the #header_toggle_menu button).
// Only one shows at a time, so the icon goes into both.
(() => {
  const SH = globalThis.SlateHelper;

  const ICON_SIZE = 24;
  const GAP = 8;
  const SHIFT = ICON_SIZE + GAP;
  // SHA-256 of Slate's default /favicon.ico (the blue "slate" square).
  const DEFAULT_FAVICONS = new Set([
    'a22a9f9839867a2bcaa969f0a560cd9d84f73d4e178095d4ae0933ab1593e135',
  ]);

  const faviconUrl = () => {
    const links = [...document.querySelectorAll('link[rel~="icon"]')];
    return links.length ? links[links.length - 1].href : `${location.origin}/favicon.ico`;
  };

  const makeIcon = (url) => {
    const icon = document.createElement('img');
    icon.className = 'slate-helper-favicon';
    icon.alt = '';
    icon.src = url;
    return icon;
  };

  // Desktop header: the logo is absolutely positioned at the left edge; shift
  // it and the menu icons right to make room.
  const addToDesktopHeader = (url) => {
    const logoItem = document.getElementById('menu__manage_');
    if (!logoItem) return;
    const icon = makeIcon(url);
    icon.style.top = `${logoItem.offsetTop + 13}px`; // vertically centered in the 50px header
    logoItem.parentElement.insertBefore(icon, logoItem);
    logoItem.style.left = `${logoItem.offsetLeft + SHIFT}px`;
    const menu = logoItem.closest('ul');
    menu.style.paddingLeft = `${parseFloat(getComputedStyle(menu).paddingLeft) + SHIFT}px`;
  };

  // Compact header: the logo is the menu-toggle button at the left edge.
  const addToCompactHeader = (url) => {
    const toggle = document.getElementById('header_toggle_menu');
    if (!toggle) return;
    const icon = makeIcon(url);
    icon.style.left = `${GAP}px`;
    icon.style.top = '12px'; // centered in the 48px header
    toggle.parentElement.insertBefore(icon, toggle);
    toggle.style.left = `${SHIFT + GAP / 2}px`;
  };

  SH.registerFeature({
    id: 'instance-favicon',
    group: 'Client instance',
    name: 'Client favicon in header',
    description: "Shows the instance's favicon to the left of the Slate logo. Nothing shows if the instance uses Slate's default icon.",
    defaultEnabled: true,
    areas: ['admin'],
    async init() {
      if (!document.getElementById('menu__manage_') && !document.getElementById('header_toggle_menu')) return;

      // Favicons usually live on Slate's CDN (another origin), which content
      // scripts can't read, so the background fetches and hashes it.
      const url = faviconUrl();
      const hash = await chrome.runtime.sendMessage({ type: 'slate-helper:hash-image', url });
      if (!hash || DEFAULT_FAVICONS.has(hash)) return;

      SH.injectStyle('instance-favicon', `
        .slate-helper-favicon {
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
      addToDesktopHeader(url);
      addToCompactHeader(url);
    },
  });
})();

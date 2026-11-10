// Portal sub-pages (views, methods, queries, ...): an Impersonate button at the
// top of the page's button stack, like the one on the portal's own page.
//
// Slate's button is a link whose inline onclick runs FW.Lazy.Popup on its
// data-href, /manage/database/portal/edit?cmd=impersonate&portal=<id>; nothing
// in it depends on being on the portal page. Sub-pages name their portal in the
// breadcrumb (All Portals > <portal> > ...), so we build the same link from
// that. Inline handlers set from here run in the page, where FW lives, and
// Impersonate on pick and Recent impersonations work in the dialog it opens.
//
// Slate only has the button on gated portals (an Anonymous/Guest portal has
// no one to impersonate), and a sub-page doesn't say which kind its portal is.
// So we fetch the portal's page once per page load and look for Slate's own
// button (#impersonate): every portal page has the link, but an anonymous
// one's sits in an <li class="hidden">. For those our Impersonate button is a
// plain link to the portal's URL instead (no record to pick), which their page
// shows as a link in its URL row.
(() => {
  const SH = globalThis.SlateHelper;

  const PORTAL_EDIT = '/manage/database/portal/edit';

  // The portal id from the breadcrumb, or null when the page isn't under a portal.
  const portalId = () => {
    for (const a of document.querySelectorAll('ul.breadcrumb a[href]')) {
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.pathname === PORTAL_EDIT && url.searchParams.get('id')) return url.searchParams.get('id');
    }
    return null;
  };

  // What the portal's page offers: { impersonate: true } for a gated portal,
  // { url } for an anonymous one, or null when neither can be found.
  const fromPortalPage = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const item = doc.getElementById('impersonate')?.closest('li');
    if (item && !item.classList.contains('hidden')) return { impersonate: true };
    const label = [...doc.querySelectorAll('table.plain th')].find((th) => th.textContent.trim() === 'URL');
    const href = label?.nextElementSibling?.querySelector('a[href]')?.getAttribute('href');
    return href ? { url: new URL(href, location.href).href } : null;
  };

  // Portal id -> Promise of fromPortalPage's answer, fetched once per page load.
  const portals = new Map();
  const portal = (id) => {
    if (!portals.has(id)) {
      portals.set(id, fetch(`${PORTAL_EDIT}?id=${encodeURIComponent(id)}`, { credentials: 'same-origin' })
        .then((res) => (res.ok ? res.text() : ''))
        .then(fromPortalPage)
        .catch((err) => {
          SH.log('impersonate-button: could not check portal', id, err);
          return null;
        }));
    }
    return portals.get(id);
  };

  // The portal's own page has the real button; ours is added once.
  const hasButton = () => !!document.querySelector('#impersonate, .slate-helper-impersonate');

  const insert = (list, id, info) => {
    const link = document.createElement('a');
    link.textContent = 'Impersonate';
    if (info.impersonate) {
      link.href = '#';
      link.dataset.href = `${PORTAL_EDIT}?cmd=impersonate&portal=${encodeURIComponent(id)}`;
      link.setAttribute('onclick', 'return FW.Lazy.Popup(this);');
    } else {
      link.href = info.url; // a plain link, so Ctrl+click opens a new tab
    }
    const item = document.createElement('li');
    item.className = `${info.impersonate ? 'impersonate ' : ''}slate-helper-impersonate`;
    item.appendChild(link);
    // Some stacks wrap their items in a div (#file_details).
    const first = list.querySelector('li');
    if (first) first.before(item);
    else list.appendChild(item);
    SH.log('impersonate-button: added for portal', id, info);
  };

  SH.registerFeature({
    id: 'impersonate-button',
    group: 'Utilities',
    name: 'Impersonate from portal pages',
    description: 'Adds the portal\'s Impersonate button to its view, method and query pages, so you can preview without going back to the portal. On Anonymous/Guest portals it just opens the portal.',
    defaultEnabled: true,
    areas: ['admin'],
    init() {
      const add = async () => {
        if (hasButton()) return;
        const id = document.querySelector('ul.action-links') && portalId();
        const info = id && (await portal(id));
        if (!info) return;
        const list = document.querySelector('ul.action-links'); // the page may have changed meanwhile
        if (list && !hasButton() && portalId() === id) insert(list, id, info);
      };
      add();
      SH.onDomChange(add);
    },
  });
})();

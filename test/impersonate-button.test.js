import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

// A gated portal's page and an Anonymous/Guest one's, as Slate renders them:
// both have the Impersonate link, but the anonymous one hides it and shows its
// URL as a link. Each test's pages use one of these, by id.
const GATED = '40669f4d-d21f-4690-be3a-00fb7cc290cb';
const ANONYMOUS = '28a9e034-8ad9-4242-8e04-8988e5906c4a';
const ANONYMOUS_URL = 'https://apply.example.edu/portal/practice';
const portalPage = ({ shown, url }) => `
  <table class="plain"><tr><th>URL</th><td>${shown ? url : `<a href="${url}" target="_blank">${url}</a>`}</td></tr></table>
  <ul class="action-links">
    <li class="${shown ? 'impersonate' : 'hidden'}"><a id="impersonate" href="#">Impersonate</a></li>
    <li><a href="#">Embed Portal</a></li>
  </ul>`;
const PORTAL_PAGES = {
  [GATED]: portalPage({ shown: true, url: 'https://apply.example.edu/portal/events' }),
  [ANONYMOUS]: portalPage({ shown: false, url: ANONYMOUS_URL }),
};

const breadcrumb = (portal = GATED) => `
  <ul class="breadcrumb">
    <li><a href="/manage/database/portal/">All Portals</a></li>
    ${portal ? `<li><a href="/manage/database/portal/edit?id=${portal}">Event Portal</a></li>` : ''}
  </ul>`;

// A view page's button stack, and a method page's, which wraps its items.
const VIEW_STACK = '<ul class="action-links"><li><a href="#">View as List</a></li><li><a href="#">Collapse All</a></li></ul>';
const METHOD_STACK = '<ul class="action-links"><div id="file_details"><li><a href="#">Edit Linked Queries</a></li></div></ul>';

const start = async () => {
  delete globalThis.SlateHelper;
  loadScripts('src/content/core.js', 'src/content/features/impersonate-button.js');
  globalThis.SlateHelper.features.find((f) => f.id === 'impersonate-button').init();
  await sleep(0);
};

const buttons = () => [...document.querySelectorAll('a')].filter((a) => a.textContent === 'Impersonate');

describe('impersonate from portal pages', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (url) => {
      const page = PORTAL_PAGES[new URL(url, location.href).searchParams.get('id')];
      return { ok: !!page, text: async () => page || '' };
    });
  });

  it.each([['view', VIEW_STACK], ['method', METHOD_STACK]])('links a %s page to its portal\'s Impersonate dialog', async (_, stack) => {
    document.body.innerHTML = breadcrumb() + stack;
    await start();

    const [button] = buttons();
    expect(button.closest('li')).toBe(document.querySelector('.action-links li'));
    // Slate's own button: an inline handler (it runs in the page, where FW is;
    // jsdom runs those in a global tests can't reach) popping up data-href.
    expect(button.getAttribute('onclick')).toBe('return FW.Lazy.Popup(this);');
    const url = new URL(button.dataset.href, location.href);
    expect(url.pathname).toBe('/manage/database/portal/edit');
    expect(Object.fromEntries(url.searchParams)).toEqual({ cmd: 'impersonate', portal: GATED });
  });

  it('links an anonymous portal\'s pages straight to the portal, with no dialog', async () => {
    document.body.innerHTML = breadcrumb(ANONYMOUS) + VIEW_STACK;
    await start();

    const [button] = buttons();
    expect(button.closest('li')).toBe(document.querySelector('.action-links li'));
    expect(button.href).toBe(ANONYMOUS_URL);
    expect(button.hasAttribute('onclick')).toBe(false);
  });

  it('adds nothing on the portal page itself or outside a portal', async () => {
    document.body.innerHTML = breadcrumb() + PORTAL_PAGES[GATED];
    await start();
    expect(buttons()).toHaveLength(1);

    document.body.innerHTML = breadcrumb(null) + VIEW_STACK;
    await start();
    expect(buttons()).toHaveLength(0);
  });

  it('adds the button once as the page changes', async () => {
    document.body.innerHTML = breadcrumb() + VIEW_STACK;
    await start();
    document.body.appendChild(document.createElement('div'));
    await sleep(50);
    expect(buttons()).toHaveLength(1);
  });
});

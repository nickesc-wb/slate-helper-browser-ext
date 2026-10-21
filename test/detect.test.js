import { beforeEach, describe, expect, it } from 'vitest';
import { loadScripts } from './helpers/load.js';

// What probe-main.js reports from the page world: is Slate's FW global there?
const probe = (hasFw) => document.documentElement.setAttribute('data-slate-helper-fw', hasFw ? '1' : '0');

describe('detectSlate', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    history.replaceState(null, '', '/');
    delete globalThis.SlateHelper;
    loadScripts('src/content/core.js', 'src/content/detect.js');
  });

  const detect = () => globalThis.SlateHelper.detectSlate();

  it('an ordinary page is not Slate', async () => {
    probe(false);
    expect(await detect()).toMatchObject({ isSlate: false, score: 0, area: 'other' });
  });

  it('the FW global alone is enough', async () => {
    probe(true);
    expect(await detect()).toMatchObject({ isSlate: true, score: 5 });
  });

  it('adds up weaker signals', async () => {
    probe(false);
    history.replaceState(null, '', '/apply/');
    document.body.innerHTML = '<a href="https://technolutions.com">Slate</a>';
    const result = await detect();
    expect(result).toMatchObject({ isSlate: true, score: 5, area: 'apply' });
    expect(result.signals.map((s) => s.id)).toEqual(['slate-path', 'technolutions-link']);
  });

  it('a Slate-looking path alone is not enough', async () => {
    probe(false);
    history.replaceState(null, '', '/portal/status');
    expect(await detect()).toMatchObject({ isSlate: false, area: 'portal' });
  });

  it.each([
    ['/manage', 'admin'],
    ['/manage/query/', 'admin'],
    ['/Manage/database', 'admin'],
    ['/apply/frm', 'apply'],
    ['/register/?id=1', 'portal'],
    ['/account/login', 'portal'],
    ['/managed', 'other'],
    ['/', 'other'],
  ])('%s is the %s area', async (path, area) => {
    probe(true);
    history.replaceState(null, '', path);
    expect((await detect()).area).toBe(area);
  });

  it('waits for the page-world probe if it has not reported yet', async () => {
    document.documentElement.removeAttribute('data-slate-helper-fw');
    const result = detect();
    probe(true);
    document.dispatchEvent(new CustomEvent('slate-helper:probe'));
    expect(await result).toMatchObject({ isSlate: true });
  });
});

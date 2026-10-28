import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

// Just enough of the chrome.* API for the isolated-world scripts.
const stubChrome = (stored = {}) => {
  globalThis.chrome = {
    storage: { sync: { get: vi.fn(async (defaults) => ({ ...defaults, ...stored })) } },
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(async () => {}),
    },
  };
};

const run = async (stored) => {
  stubChrome(stored);
  delete globalThis.SlateHelper;
  loadScripts('src/content/core.js', 'src/content/detect.js', 'src/content/page-features.js', 'src/content/main.js');
  await sleep(0);
  await sleep(0);
  return globalThis.SlateHelper.state;
};

const pageConfig = () => JSON.parse(document.documentElement.getAttribute('data-slate-helper-config'));

describe('content entry point', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-slate-helper-config');
    document.documentElement.className = '';
    document.documentElement.setAttribute('data-slate-helper-fw', '1');
    history.replaceState(null, '', '/manage/');
  });

  it('hands the enabled page features and every option to the page world', async () => {
    const state = await run();
    expect(state.active).toBe(true);
    expect(document.documentElement.classList.contains('slate-helper-area-admin')).toBe(true);

    const config = pageConfig();
    expect(config.area).toBe('admin');
    expect(config.enabled).toContain('source-autocomplete');
    expect(config.options['source-indent.splitOnType']).toBe(false);
    expect(config.options['source-indent.tab']).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'slate-helper:status', active: true });
  });

  it('applies saved feature and option settings', async () => {
    await run({ features: { 'source-autocomplete': false, 'source-indent.tab': false } });
    const config = pageConfig();
    expect(config.enabled).not.toContain('source-autocomplete');
    expect(config.enabled).toContain('source-indent');
    expect(config.options['source-indent.tab']).toBe(false);
  });

  it('skips admin-only features outside /manage', async () => {
    history.replaceState(null, '', '/apply/');
    await run();
    expect(pageConfig().enabled).toEqual([]);
  });

  it('asks the background to inject allowed on-demand scripts', async () => {
    await run();
    document.dispatchEvent(new CustomEvent('slate-helper:load', { detail: 'source-tools' }));
    document.dispatchEvent(new CustomEvent('slate-helper:load', { detail: '../popup/popup' }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'slate-helper:inject', name: 'source-tools' });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'slate-helper:inject', name: '../popup/popup' });
  });

  it('does nothing on a site turned off in the popup', async () => {
    const state = await run({ siteOverrides: { [location.hostname]: 'off' } });
    expect(state.active).toBe(false);
    expect(document.documentElement.hasAttribute('data-slate-helper-config')).toBe(false);
  });

  it('runs on a site turned on in the popup even if detection says no', async () => {
    document.documentElement.setAttribute('data-slate-helper-fw', '0');
    history.replaceState(null, '', '/');
    const state = await run({ siteOverrides: { [location.hostname]: 'on' } });
    expect(state.detection.isSlate).toBe(false);
    expect(state.active).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

// Just enough of the chrome.* API for the isolated-world scripts.
const stubChrome = (stored = {}) => {
  globalThis.chrome = {
    storage: { sync: { get: vi.fn(async (defaults) => ({ ...defaults, ...stored })), set: vi.fn(async () => {}) } },
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

  it('passes choice options as their value, falling back to the default for unknown values', async () => {
    await run();
    expect(pageConfig().options['source-docs.view']).toBe('standard');
    await run({ features: { 'source-docs.view': 'verbose' } });
    expect(pageConfig().options['source-docs.view']).toBe('verbose');
    const state = await run({ features: { 'source-docs.view': 'gone' } });
    expect(pageConfig().options['source-docs.view']).toBe('standard');
    const view = state.features.find((f) => f.id === 'source-docs').options.find((o) => o.id === 'view');
    expect(view.choices.map((c) => c.value)).toEqual(['compact', 'standard', 'verbose']);
  });

  it('passes text options as their saved text, empty by default', async () => {
    await run();
    expect(pageConfig().options['source-format.prettierConfig']).toBe('');
    const state = await run({ features: { 'source-format.prettierConfig': '{ "semi": false }' } });
    expect(pageConfig().options['source-format.prettierConfig']).toBe('{ "semi": false }');
    const config = state.features.find((f) => f.id === 'source-format').options.find((o) => o.id === 'prettierConfig');
    expect(config).toMatchObject({ text: true, requires: 'prettier', value: '{ "semi": false }' });
    expect(config.json.keys.printWidth).toBe('number');
  });

  it('asks the background to inject allowed on-demand scripts', async () => {
    await run();
    document.dispatchEvent(new CustomEvent('slate-helper:load', { detail: 'source-tools' }));
    document.dispatchEvent(new CustomEvent('slate-helper:load', { detail: '../popup/popup' }));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'slate-helper:inject', name: 'source-tools' });
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ type: 'slate-helper:inject', name: '../popup/popup' });
  });

  it('saves the one setting the page may change (the Wrap button), and nothing else', async () => {
    const state = await run({ features: { 'source-autocomplete': false } });
    const send = (detail) => document.dispatchEvent(new CustomEvent('slate-helper:set-setting', { detail }));
    send(JSON.stringify({ key: 'source-autocomplete', value: true }));
    send(JSON.stringify({ key: 'source-no-wrap', value: 'yes' }));
    send('not json');
    await sleep(0);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    send(JSON.stringify({ key: 'source-no-wrap', value: true }));
    // (Each run() above added a listener, so it may be saved more than once.)
    await vi.waitFor(() => expect(chrome.storage.sync.set).toHaveBeenCalled());
    for (const [arg] of chrome.storage.sync.set.mock.calls) {
      expect(arg).toEqual({ features: { 'source-autocomplete': false, 'source-no-wrap': true } });
    }
    expect(state.features.find((f) => f.id === 'source-no-wrap').enabled).toBe(true); // what the popup shows
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

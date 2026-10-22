import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts } from './helpers/load.js';

const RELEASE = { version: '0.2.0', url: 'https://github.com/nickesc-wb/slate-helper-browser-ext/releases/tag/v0.2.0' };

// Loads the feature against a stubbed chrome.* and returns it.
const load = ({ installed = '0.1.0', release = RELEASE, dismissed } = {}) => {
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: installed }),
      sendMessage: vi.fn(async () => release),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({ dismissedRelease: dismissed })),
        set: vi.fn(async () => {}),
      },
    },
  };
  delete globalThis.SlateHelper;
  loadScripts('src/content/core.js', 'src/content/features/update-toast.js');
  return globalThis.SlateHelper.features.find((f) => f.id === 'update-toast');
};

const toast = () => document.getElementById('slate-helper-update-toast');

describe('update toast', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('compares versions numerically', () => {
    load();
    const newer = globalThis.SlateHelper.isNewerVersion;
    expect(newer('0.2.0', '0.1.0')).toBe(true);
    expect(newer('0.10.0', '0.9.1')).toBe(true);
    expect(newer('1.0', '0.9.9')).toBe(true);
    expect(newer('0.1.0', '0.1.0')).toBe(false);
    expect(newer('0.1', '0.1.0')).toBe(false);
    expect(newer('0.1.0', '0.2.0')).toBe(false);
  });

  it('shows a link to a newer release', async () => {
    await load().init();
    expect(toast().textContent).toContain('Slate Helper 0.2.0 is available');
    expect(toast().querySelector('a').href).toBe(RELEASE.url);
  });

  it('stays hidden when the installed version is current or newer', async () => {
    await load({ installed: '0.2.0' }).init();
    expect(toast()).toBeNull();
    await load({ installed: '0.3.0' }).init();
    expect(toast()).toBeNull();
  });

  it('stays hidden when the release check failed', async () => {
    await load({ release: null }).init();
    expect(toast()).toBeNull();
  });

  it('remembers a dismissed release until the next one', async () => {
    await load().init();
    toast().querySelector('button').click();
    expect(toast()).toBeNull();
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ dismissedRelease: '0.2.0' });

    await load({ dismissed: '0.2.0' }).init();
    expect(toast()).toBeNull();
    await load({ dismissed: '0.2.0', release: { ...RELEASE, version: '0.3.0' } }).init();
    expect(toast()).not.toBeNull();
  });
});

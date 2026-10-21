import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScripts, sleep } from './helpers/load.js';

const boot = (config) => {
  document.documentElement.setAttribute('data-slate-helper-config', JSON.stringify(config));
  window.SlateHelperPage.boot();
};

describe('page runtime', () => {
  let SHP;
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-slate-helper-config');
    delete window.SlateHelperPage;
    loadScripts('src/page/runtime.js');
    SHP = window.SlateHelperPage;
  });

  it('starts only the enabled features', () => {
    const a = vi.fn();
    const b = vi.fn();
    SHP.registerFeature('a', a);
    SHP.registerFeature('b', b);
    boot({ enabled: ['a'] });
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
  });

  it('waits for the activate event when the config is not there yet', () => {
    const a = vi.fn();
    SHP.registerFeature('a', a);
    SHP.boot();
    expect(a).not.toHaveBeenCalled();
    document.documentElement.setAttribute('data-slate-helper-config', JSON.stringify({ enabled: ['a'] }));
    document.dispatchEvent(new CustomEvent('slate-helper:activate'));
    document.dispatchEvent(new CustomEvent('slate-helper:activate'));
    expect(a).toHaveBeenCalledOnce();
  });

  it('keeps starting features after one throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const b = vi.fn();
    SHP.registerFeature('a', () => { throw new Error('boom'); });
    SHP.registerFeature('b', b);
    boot({ enabled: ['a', 'b'] });
    expect(b).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('reads options, treating missing ones as on', () => {
    boot({ enabled: [], options: { 'f.off': false, 'f.on': true } });
    expect(SHP.option('f', 'off')).toBe(false);
    expect(SHP.option('f', 'on')).toBe(true);
    expect(SHP.option('f', 'unknown')).toBe(true);
  });

  it('onAdded runs once per element, for existing and later ones', async () => {
    document.body.innerHTML = '<div class="x"></div>';
    const first = document.body.firstElementChild;
    const seen = [];
    SHP.onAdded('.x', (el) => seen.push(el));
    expect(seen).toEqual([first]);

    const later = document.createElement('div');
    later.className = 'x';
    document.body.append(later);
    await sleep(60);
    document.body.append(document.createElement('span')); // rescans must not repeat
    await sleep(60);
    expect(seen).toEqual([first, later]);
  });

  it('onAdded waits until when(el) is true', async () => {
    document.body.innerHTML = '<div class="x"></div>';
    const el = document.body.firstElementChild;
    const cb = vi.fn();
    SHP.onAdded('.x', cb, (e) => e.dataset.ready === '1');
    expect(cb).not.toHaveBeenCalled();
    el.dataset.ready = '1';
    document.body.append(document.createElement('span'));
    await sleep(60);
    expect(cb).toHaveBeenCalledWith(el);
  });

  it('injectStyle reuses one <style> per id', () => {
    SHP.injectStyle('t', 'a {}');
    SHP.injectStyle('t', 'b {}');
    const styles = document.querySelectorAll('#slate-helper-style-t');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe('b {}');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadScripts, sleep } from './helpers/load.js';

const body = readFileSync(resolve(ROOT, 'src/popup/popup.html'), 'utf8').match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>/g, '');

const feature = (id, group, options = []) => ({
  id, group, name: id, description: `${id} description`, enabled: true, appliesHere: true, options,
});

const STATE = {
  ready: true,
  host: 'slate.example.edu',
  override: 'auto',
  active: true,
  detection: { isSlate: true, area: 'admin', score: 6, threshold: 3, signals: [] },
  groups: ['Dialogs', 'Source typing', 'Source tools', 'Source checks & docs', 'Query builder', 'Extension'],
  features: [
    feature('link-dialog', 'Dialogs'),
    feature('source-indent', 'Source typing', [{ id: 'tab', name: 'Tab indents', enabled: true }]),
    feature('source-docs', 'Source checks & docs', [{
      id: 'view', name: 'Detail', value: 'compact',
      choices: [{ value: 'compact', label: 'Compact' }, { value: 'verbose', label: 'Verbose' }],
    }]),
    feature('dblclick-picker', 'Query builder'),
    feature('instance-badge', 'Extension'),
    feature('mystery', 'Other'),
  ],
};

// Opens the popup against a stubbed chrome.* the way Chrome would.
const open = async (state = STATE) => {
  document.body.innerHTML = body;
  const stored = { features: {} };
  globalThis.chrome = {
    tabs: {
      query: vi.fn(async () => [{ id: 1, url: 'https://slate.example.edu/manage/' }]),
      sendMessage: vi.fn(async () => state),
      reload: vi.fn(),
    },
    runtime: { getManifest: () => ({ version: '0.1.10' }), sendMessage: vi.fn(async () => null) },
    storage: {
      sync: {
        get: vi.fn(async (defaults) => ({ ...defaults, ...structuredClone(stored) })),
        set: vi.fn(async (values) => Object.assign(stored, values)),
      },
    },
  };
  loadScripts('src/popup/popup.js');
  await sleep(0);
  await sleep(0);
  return stored;
};

const tabs = () => [...document.querySelectorAll('[role="tab"]')];
const selected = () => document.querySelector('[role="tab"][aria-selected="true"]');
const visiblePanels = () => [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden);
const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
const tabNamed = (title) => tabs().find((t) => t.title === title);

describe('popup', () => {
  beforeEach(() => localStorage.clear());

  it('puts each group with features on its own tab, Other last', async () => {
    await open();
    expect(tabs().map((t) => t.title)).toEqual(['Dialogs', 'Source typing', 'Source checks & docs', 'Query builder', 'Extension', 'Other']);
    expect(tabs().map((t) => t.textContent)).toEqual(['Dialogs', 'Typing', 'Checks', 'Queries', 'Extension', 'Other']);
    const source = panelOf(tabNamed('Source typing'));
    expect([...source.querySelectorAll('.name')].map((n) => n.textContent)).toEqual(['source-indent']);
  });

  it('opens on the first tab and shows only its features', async () => {
    await open();
    expect(selected().title).toBe('Dialogs');
    expect(visiblePanels()).toEqual([panelOf(selected())]);
    expect(document.getElementById('main').hidden).toBe(false);
  });

  it('switches tabs on click and remembers the last one', async () => {
    await open();
    tabNamed('Source typing').click();
    expect(selected().title).toBe('Source typing');
    expect(visiblePanels()).toEqual([panelOf(tabNamed('Source typing'))]);

    await open();
    expect(selected().title).toBe('Source typing');
  });

  it('falls back to the first tab when the remembered group is gone', async () => {
    localStorage.setItem('slate-helper-popup-tab', 'Removed group');
    await open();
    expect(selected().title).toBe('Dialogs');
  });

  it('moves between tabs with the arrow keys, wrapping around', async () => {
    await open();
    const key = (k) => selected().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('ArrowLeft');
    expect(selected().title).toBe('Other');
    expect(document.activeElement).toBe(selected());
    key('ArrowRight');
    expect(selected().title).toBe('Dialogs');
    key('End');
    expect(selected().title).toBe('Other');
    key('Home');
    expect(selected().title).toBe('Dialogs');
    expect(tabs().filter((t) => t.tabIndex === 0)).toEqual([selected()]);
  });

  it('saves feature toggles and options from any tab', async () => {
    const stored = await open();
    const source = panelOf(tabNamed('Source typing'));
    tabNamed('Source typing').click();

    source.querySelector('.switch input').click();
    await sleep(0);
    expect(stored.features['source-indent']).toBe(false);
    expect(source.querySelector('.option input').disabled).toBe(true);

    tabNamed('Source checks & docs').click();
    const select = panelOf(selected()).querySelector('select');
    select.value = 'verbose';
    select.dispatchEvent(new Event('change'));
    await sleep(0);
    expect(stored.features['source-docs.view']).toBe('verbose');
    expect(document.getElementById('reload-note').hidden).toBe(false);
  });
});

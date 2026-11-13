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
  groups: ['Dialogs', 'Editing', 'Utilities', 'Extension'],
  subgroups: { Editing: ['Checks', 'Coding', 'Tools'] },
  features: [
    feature('link-dialog', 'Dialogs'),
    { ...feature('source-indent', 'Editing', [{ id: 'tab', name: 'Tab indents', enabled: true }]), subgroup: 'Coding' },
    { ...feature('source-docs', 'Editing', [{
      id: 'view', name: 'Detail', value: 'compact',
      choices: [{ value: 'compact', label: 'Compact' }, { value: 'verbose', label: 'Verbose' }],
    }]), subgroup: 'Checks' },
    feature('dblclick-picker', 'Dialogs'),
    { ...feature('source-format', 'Editing'), subgroup: 'Tools' },
    feature('source-loose', 'Editing'),
    feature('instance-badge', 'Utilities'),
    feature('update-toast', 'Extension'),
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
    expect(tabs().map((t) => t.textContent)).toEqual(['Dialogs', 'Editing', 'Utilities', 'Extension', 'Other']);
    const utilities = panelOf(tabNamed('Utilities'));
    expect([...utilities.querySelectorAll('.name')].map((n) => n.textContent)).toEqual(['instance-badge']);
  });

  it('puts features under their subgroup headings inside a tab', async () => {
    await open();
    const editing = panelOf(tabNamed('Editing'));
    const sections = Object.fromEntries([...editing.querySelectorAll('.card')].map((card) => [
      card.previousElementSibling?.matches('.subgroup') ? card.previousElementSibling.textContent : '(none)',
      [...card.querySelectorAll('.name')].map((n) => n.textContent),
    ]));
    expect(sections).toEqual({
      Checks: ['source-docs'],
      Coding: ['source-indent'],
      Tools: ['source-format'],
      '(none)': ['source-loose'],
    });
  });

  it('opens on the first tab and shows only its features', async () => {
    await open();
    expect(selected().title).toBe('Dialogs');
    expect(visiblePanels()).toEqual([panelOf(selected())]);
    expect(document.getElementById('main').hidden).toBe(false);
  });

  it('switches tabs on click and remembers the last one', async () => {
    await open();
    tabNamed('Editing').click();
    expect(selected().title).toBe('Editing');
    expect(visiblePanels()).toEqual([panelOf(tabNamed('Editing'))]);

    await open();
    expect(selected().title).toBe('Editing');
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
    const editing = panelOf(tabNamed('Editing'));
    tabNamed('Editing').click();

    const indent = [...editing.querySelectorAll('.feature')].find((f) => f.querySelector('.name').textContent === 'source-indent');
    indent.querySelector('.switch input').click();
    await sleep(0);
    expect(stored.features['source-indent']).toBe(false);
    expect(indent.querySelector('.option input').disabled).toBe(true);

    const select = editing.querySelector('select');
    select.value = 'verbose';
    select.dispatchEvent(new Event('change'));
    await sleep(0);
    expect(stored.features['source-docs.view']).toBe('verbose');

    tabNamed('Utilities').click();
    panelOf(selected()).querySelector('.switch input').click();
    await sleep(0);
    expect(stored.features['instance-badge']).toBe(false);
    expect(document.getElementById('reload-note').hidden).toBe(false);
  });

  it('greys out options while the option they need is off, and saves a JSON text option only when it checks out', async () => {
    const options = [
      { id: 'prettier', name: 'Use Prettier', enabled: false },
      { id: 'onOpen', name: 'On open', enabled: false, requires: 'prettier' },
      {
        id: 'prettierConfig', name: 'Config', text: true, requires: 'prettier', value: '',
        json: { keys: { printWidth: 'number', semi: 'boolean', trailingComma: ['all', 'none'] }, warn: [{ key: 'semi', value: false, message: 'careful' }] },
      },
    ];
    const state = { ...STATE, features: [{ ...feature('source-format', 'Editing', options), subgroup: 'Tools' }] };
    const stored = await open(state);
    const format = document.querySelector('.feature');
    const area = format.querySelector('textarea');
    const errors = () => [...format.querySelectorAll('.option-error')];
    const write = (text) => {
      area.value = text;
      area.dispatchEvent(new Event('input'));
      area.dispatchEvent(new Event('change'));
    };

    const [prettier, onOpen] = format.querySelectorAll('.option input[type="checkbox"]');
    expect(area.disabled).toBe(true);
    expect(onOpen.disabled).toBe(true);
    prettier.click();
    expect(area.disabled).toBe(false);
    expect(onOpen.disabled).toBe(false);
    await sleep(0);

    for (const bad of ['{ "printWidth": ', '[1]', '{ "printWidth": "wide" }', '{ "trailingComma": "sometimes" }', '{ "parser": "babel" }', '{ "printwidth": 80 }']) {
      write(bad);
      await sleep(0);
      expect(errors().length, bad).toBeGreaterThan(0);
      expect(area.getAttribute('aria-invalid')).toBe('true');
      expect(stored.features['source-format.prettierConfig']).toBeUndefined();
    }

    write(' { "printWidth": 100, "semi": false } ');
    await sleep(0);
    expect(errors()).toEqual([]);
    expect(format.querySelectorAll('.option-warning')).toHaveLength(1);
    expect(stored.features['source-format.prettierConfig']).toBe('{ "printWidth": 100, "semi": false }');

    write('');
    await sleep(0);
    expect(stored.features['source-format.prettierConfig']).toBe('');
  });
});

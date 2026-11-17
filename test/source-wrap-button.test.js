import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeMirror, setupEditor } from './helpers/codemirror.js';
import { sleep } from './helpers/load.js';

/**
 * A page runtime with these features, then a CKEditor the way Slate builds it:
 * a toolbar with a Source button and a source view (a CodeMirror that wraps,
 * as Slate's do).
 */
const open = async (features, { mode = 'source' } = {}) => {
  // Page runtimes from earlier tests still watch the old <body>: let their
  // timers run out, then move to a body they don't watch.
  await sleep(40);
  document.body.replaceWith(document.createElement('body'));
  setupEditor(features, '');
  document.body.innerHTML = '';
  const cke = document.createElement('div');
  cke.className = 'cke';
  cke.innerHTML = `
    <span class="cke_toolbar"><a class="cke_button cke_button__source cke_button_on">
      <span class="cke_button_icon"></span><span class="cke_button_label">Source</span>
    </a></span>`;
  document.body.append(cke);
  const editor = { mode, status: 'ready', container: { $: cke }, on() {}, once() {} };
  window.CKEDITOR = { instances: { editor1: editor } };
  const cm = CodeMirror(cke, { mode: 'liquid', value: '<p>a long line</p>', lineWrapping: true });
  await sleep(40); // the DOM watcher's debounce
  return { cm, editor, button: document.querySelector('.slate-helper-wrap') };
};

let saved;
const onSave = (e) => saved.push(JSON.parse(e.detail));
beforeEach(() => {
  saved = [];
  document.addEventListener('slate-helper:set-setting', onSave);
});
afterEach(() => document.removeEventListener('slate-helper:set-setting', onSave));

describe('source-wrap-button', () => {
  it('turns wrapping off and on, and saves it as "Don\'t wrap long lines"', async () => {
    const { cm, button } = await open(['source-wrap-button']);
    expect(button.querySelector('.cke_button_label').textContent).toBe('Wrap');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    button.click();
    expect(cm.getOption('lineWrapping')).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.classList.contains('cke_button_off')).toBe(true);

    button.click();
    expect(cm.getOption('lineWrapping')).toBe(true);
    expect(button.classList.contains('cke_button_on')).toBe(true);
    expect(saved).toEqual([{ key: 'source-no-wrap', value: true }, { key: 'source-no-wrap', value: false }]);
  });

  it('starts from the setting, and source views opened later follow the button', async () => {
    const { cm, button } = await open(['source-no-wrap', 'source-wrap-button']);
    expect(cm.getOption('lineWrapping')).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    const later = CodeMirror(document.querySelector('.cke'), { mode: 'liquid', lineWrapping: false });
    await sleep(40);
    expect(later.getOption('lineWrapping')).toBe(true);
  });

  it('does nothing outside the source view', async () => {
    const { cm, button } = await open(['source-wrap-button'], { mode: 'wysiwyg' });
    expect(button.classList.contains('cke_button_disabled')).toBe(true);
    button.click();
    expect(cm.getOption('lineWrapping')).toBe(true);
    expect(saved).toEqual([]);
  });

  it('goes after the Format button', async () => {
    await open(['source-format', 'source-wrap-button']);
    const labels = [...document.querySelectorAll('.cke_button_label')].map((l) => l.textContent);
    expect(labels).toEqual(['Source', 'Format', 'Wrap']);
  });
});
